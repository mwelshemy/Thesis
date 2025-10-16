/**
 * REAL Context Builder for AI + Search Integration
 * Enhanced with better context prioritization and real data handling
 */

import { FileIndexEntry } from '../../search';

export interface EnhancedPrompt {
  basePrompt: string;
  context: string[];
  fullPrompt: string;
  contextFileCount: number;
}

/**
 * Builds an enhanced prompt with relevant project context
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  selectedCode: string,
  searchResults: FileIndexEntry[],
  maxContextLength: number = 2000
): EnhancedPrompt {
  console.log(
    `🔄 Building enhanced prompt with ${searchResults.length} search results`
  );

  const relevantContext = prioritizeSearchResults(selectedCode, searchResults);
  const contextSnippets = buildContextSnippets(relevantContext, maxContextLength);
  const fullPrompt = constructFullPrompt(basePrompt, selectedCode, contextSnippets);

  return {
    basePrompt,
    context: contextSnippets,
    fullPrompt,
    contextFileCount: contextSnippets.length,
  };
}

/**
 * Prioritize search results based on relevance to selected code
 */
function prioritizeSearchResults(
  selectedCode: string,
  searchResults: FileIndexEntry[]
): FileIndexEntry[] {
  if (searchResults.length === 0) return [];

  const keywords = extractKeywords(selectedCode);
  const codeStructure = analyzeCodeStructure(selectedCode);

  console.log(`🔑 Extracted keywords: ${keywords.slice(0, 5).join(', ')}`);
  console.log(`🏗️ Code structure: ${codeStructure.type}`);

  const scoredResults = searchResults.map((result) => ({
    result,
    score: calculateRelevanceScore(result, keywords, selectedCode, codeStructure),
  }));

  const prioritized = scoredResults
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((scored) => scored.result);

  console.log(`📊 Prioritized ${prioritized.length} most relevant files`);
  return prioritized;
}

/**
 * Extract relevant keywords from code
 */
function extractKeywords(code: string): string[] {
  const keywords = new Set<string>();
  const patterns = [
    /\b(function|class|interface|type|enum)\s+(\w+)/g,
    /\b(const|let|var)\s+(\w+)/g,
    /\b(export|import).*?from\s+['"]([^'"]+)['"]/g,
    /\b(public|private|protected)\s+(\w+)/g,
    /\b(extends|implements)\s+(\w+)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const keyword = match[2] || match[3];
      if (keyword && keyword.length > 2) {
        keywords.add(keyword.toLowerCase());
      }
    }
  });

  return Array.from(keywords);
}

/**
 * Analyze code structure type
 */
function analyzeCodeStructure(code: string): { type: string; elements: string[] } {
  const elements: string[] = [];
  let type = 'unknown';

  if (code.includes('class ')) {
    type = 'class';
    const classMatch = code.match(/class\s+(\w+)/);
    if (classMatch) elements.push(classMatch[1]);
  } else if (code.includes('function ')) {
    type = 'function';
    const functionMatch = code.match(/function\s+(\w+)/);
    if (functionMatch) elements.push(functionMatch[1]);
  } else if (code.includes('interface ')) {
    type = 'interface';
    const interfaceMatch = code.match(/interface\s+(\w+)/);
    if (interfaceMatch) elements.push(interfaceMatch[1]);
  } else if (code.includes('const ') || code.includes('let ') || code.includes('var ')) {
    type = 'variable';
  }

  return { type, elements };
}

/**
 * Calculate relevance score safely
 */
function calculateRelevanceScore(
  result: FileIndexEntry,
  keywords: string[],
  selectedCode: string,
  codeStructure: { type: string; elements: string[] }
): number {
  let score = 0;

  const fileName = (result.fileName ?? '').toLowerCase();
  const content = (result.content ?? '').toLowerCase();
  const selectedCodeLower = selectedCode.toLowerCase();

  if (keywords.some((k) => fileName.includes(k))) score += 4;

  keywords.forEach((k) => {
    const occurrences = (content.match(new RegExp(k, 'g')) || []).length;
    score += Math.min(occurrences * 1.5, 6);
  });

  if (content.includes(selectedCodeLower.substring(0, 100))) score += 8;
  if (codeStructure.type !== 'unknown' && content.includes(codeStructure.type)) score += 2;

  if (selectedCode.includes('import') && fileName.endsWith('.ts')) score += 1;

  const daysSinceModification =
    (Date.now() - (result.lastModified?.getTime?.() ?? Date.now())) / (1000 * 60 * 60 * 24);
  if (daysSinceModification < 7) score += 1;

  return score;
}

/**
 * Build safe context snippets
 */
function buildContextSnippets(results: FileIndexEntry[], maxLength: number): string[] {
  const snippets: string[] = [];
  let currentLength = 0;

  for (const result of results) {
    if (currentLength >= maxLength) break;

    const snippet = formatContextSnippet(result);
    const snippetLength = snippet.length;

    if (currentLength + snippetLength <= maxLength) {
      snippets.push(snippet);
      currentLength += snippetLength;
    }
  }

  console.log(`📄 Built ${snippets.length} context snippets (${currentLength} chars)`);
  return snippets;
}

/**
 * Format snippet (null-safe)
 */
function formatContextSnippet(result: FileIndexEntry): string {
  const maxSnippetLength = 500;
  let contentSnippet = result.content ?? '';

  if ((contentSnippet ?? '').length > maxSnippetLength) {
    const breakPoints = ['.', ';', '\n', '}'];
    let breakIndex = maxSnippetLength;

    for (const point of breakPoints) {
      const pointIndex = (contentSnippet ?? '').lastIndexOf(point, maxSnippetLength);
      if (pointIndex > maxSnippetLength * 0.8) {
        breakIndex = pointIndex + 1;
        break;
      }
    }

    contentSnippet = (contentSnippet ?? '').substring(0, breakIndex) + '...';
  }

  return `📄 File: ${result.fileName ?? 'unknown'}
🔤 Language: ${result.language ?? 'unknown'}
📏 Lines: ${result.lineCount ?? 'N/A'}
---
${contentSnippet}
---`;
}

/**
 * Construct final AI prompt
 */
function constructFullPrompt(
  basePrompt: string,
  selectedCode: string,
  contextSnippets: string[]
): string {
  if (contextSnippets.length === 0) {
    return `${basePrompt}

## Code to Analyze:
\`\`\`
${selectedCode}
\`\`\``;
  }

  const contextSection = contextSnippets.join('\n\n');
  const contextSummary = `I found ${contextSnippets.length} relevant files in the project that might provide context.`;

  return `${basePrompt}

${contextSummary}

## Project Context:
${contextSection}

## Selected Code to Analyze:
\`\`\`
${selectedCode}
\`\`\`

## Analysis Request:
Please analyze the selected code above, considering the project context provided. Focus on how this code relates to or differs from similar patterns in the project.`;
}

/**
 * Fallback prompt builder (null-safe)
 */
export function buildSimpleContextPrompt(
  basePrompt: string,
  selectedCode: string,
  searchResults: FileIndexEntry[]
): string {
  if (searchResults.length === 0) {
    return `${basePrompt}

\`\`\`
${selectedCode}
\`\`\``;
  }

  const context = searchResults
    .slice(0, 2)
    .map(
      (result) =>
        `Related file: ${result.fileName ?? 'unknown'}\nSnippet: ${(result.content ?? '').substring(0, 250)}...`
    )
    .join('\n\n');

  return `${basePrompt}

## Project Context:
${context}

## Code:
\`\`\`
${selectedCode}
\`\`\``;
}
