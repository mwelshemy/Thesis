/**
 * REAL Context Builder for AI + Search Integration
 * Enhanced with better context prioritization and real data handling
 */

import { FileIndexEntry } from '../search';

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

  // Filter and prioritize search results
  const relevantContext = prioritizeSearchResults(selectedCode, searchResults);

  // Build context string within length limits
  const contextSnippets = buildContextSnippets(
    relevantContext,
    maxContextLength
  );

  // Construct the full enhanced prompt
  const fullPrompt = constructFullPrompt(
    basePrompt,
    selectedCode,
    contextSnippets
  );

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
  if (searchResults.length === 0) {
    return [];
  }

  // Extract keywords and patterns from selected code
  const keywords = extractKeywords(selectedCode);
  const codeStructure = analyzeCodeStructure(selectedCode);

  console.log(`🔑 Extracted keywords: ${keywords.slice(0, 5).join(', ')}`);
  console.log(`🏗️ Code structure: ${codeStructure.type}`);

  // Score each search result based on multiple relevance factors
  const scoredResults = searchResults.map((result) => ({
    result,
    score: calculateRelevanceScore(
      result,
      keywords,
      selectedCode,
      codeStructure
    ),
  }));

  // Sort by score (descending) and take top results
  const prioritized = scoredResults
    .sort((a, b) => b.score - a.score)
    .slice(0, 6) // Top 6 most relevant
    .map((scored) => scored.result);

  console.log(`📊 Prioritized ${prioritized.length} most relevant files`);

  return prioritized;
}

/**
 * Extract relevant keywords from code for better context matching
 */
function extractKeywords(code: string): string[] {
  const keywords = new Set<string>();

  // Common programming patterns to look for
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
      // Capture group 2 for most patterns, group 3 for imports
      const keyword = match[2] || match[3];
      if (keyword && keyword.length > 2) {
        keywords.add(keyword.toLowerCase());
      }
    }
  });

  return Array.from(keywords);
}

/**
 * Analyze code structure to understand what type of code we're dealing with
 */
function analyzeCodeStructure(code: string): {
  type: string;
  elements: string[];
} {
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
  } else if (
    code.includes('const ') ||
    code.includes('let ') ||
    code.includes('var ')
  ) {
    type = 'variable';
  }

  return { type, elements };
}

/**
 * Calculate relevance score for a search result
 */
function calculateRelevanceScore(
  result: FileIndexEntry,
  keywords: string[],
  selectedCode: string,
  codeStructure: { type: string; elements: string[] }
): number {
  let score = 0;

  const fileName = result.fileName.toLowerCase();
  const content = result.content.toLowerCase();
  const selectedCodeLower = selectedCode.toLowerCase();

  // 1. File name relevance (high weight)
  if (keywords.some((keyword) => fileName.includes(keyword))) {
    score += 4;
  }

  // 2. Content relevance (medium weight)
  keywords.forEach((keyword) => {
    const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
    score += Math.min(occurrences * 1.5, 6); // Cap at 6 per keyword
  });

  // 3. Exact code matches (very high weight)
  if (content.includes(selectedCodeLower.substring(0, 100))) {
    score += 8;
  }

  // 4. Same code structure type bonus
  if (codeStructure.type !== 'unknown') {
    if (content.includes(codeStructure.type)) {
      score += 2;
    }
  }

  // 5. File type/language consistency
  if (selectedCode.includes('import') && result.fileName.endsWith('.ts')) {
    score += 1;
  }

  // 6. Recent modification bonus (prioritize recently edited files)
  const daysSinceModification =
    (Date.now() - result.lastModified.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceModification < 7) {
    score += 1; // Bonus for files modified in the last week
  }

  return score;
}

/**
 * Build context snippets from prioritized results within length limits
 */
function buildContextSnippets(
  results: FileIndexEntry[],
  maxLength: number
): string[] {
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

  console.log(
    `📄 Built ${snippets.length} context snippets (${currentLength} chars)`
  );
  return snippets;
}

/**
 * Format a single search result as a context snippet
 */
function formatContextSnippet(result: FileIndexEntry): string {
  const maxSnippetLength = 500;
  let contentSnippet = result.content;

  // Truncate if too long, but try to end at a reasonable point
  if (contentSnippet.length > maxSnippetLength) {
    // Try to find a good breaking point (end of line, semicolon, etc.)
    const breakPoints = ['.', ';', '\n', '}'];
    let breakIndex = maxSnippetLength;

    for (const point of breakPoints) {
      const pointIndex = contentSnippet.lastIndexOf(point, maxSnippetLength);
      if (pointIndex > maxSnippetLength * 0.8) {
        breakIndex = pointIndex + 1;
        break;
      }
    }

    contentSnippet = contentSnippet.substring(0, breakIndex) + '...';
  }

  return `📄 File: ${result.fileName} 
🔤 Language: ${result.language}
📏 Lines: ${result.lineCount}
---
${contentSnippet}
---`;
}

/**
 * Construct the full enhanced prompt
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
 * Simple prompt builder for quick context (fallback)
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
        `Related file: ${result.fileName}\nSnippet: ${result.content.substring(0, 250)}...`
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
