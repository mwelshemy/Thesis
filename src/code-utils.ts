// Utility helpers for code extraction and concept extraction
export interface CodeSection {
  name: string;
  code: string;
  type: string;
  lineNumber: number;
}


/**
 * Extract a code block (function/class body or a reasonable snippet) given a start index.
 */
export function extractCodeBlock(content: string, startIndex: number, language: string): string {
  try {
    const bracketLanguages = ['javascript', 'typescript', 'java', 'cpp', 'c', 'cs', 'php', 'go', 'rust'];
    const indentLanguages = ['python', 'ruby'];

    if (bracketLanguages.includes(language)) {
      let firstBraceIndex = content.indexOf('{', startIndex);
      if (firstBraceIndex === -1) {
        const arrowIndex = content.indexOf('=>', startIndex);
        if (arrowIndex !== -1) {
          firstBraceIndex = content.indexOf('{', arrowIndex);
        }
      }
      if (firstBraceIndex === -1) {
        return content.substring(startIndex, Math.min(startIndex + 800, content.length)).trim();
      }

      let braceCount = 0;
      let inBlock = false;
      let endIndex = firstBraceIndex;
      for (let i = firstBraceIndex; i < content.length; i++) {
        const ch = content[i];
        if (ch === '{') {
          braceCount++;
          inBlock = true;
        } else if (ch === '}') {
          braceCount--;
        }
        if (inBlock && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
      return content.substring(startIndex, endIndex).trim();
    } else if (indentLanguages.includes(language)) {
      const lines = content.substring(startIndex).split('\n');
      if (lines.length === 0) return '';

      const firstLine = lines[0];
      const baseIndent = firstLine.match(/^\s*/)?.[0].length || 0;
      const codeLines = [firstLine];

      for (let i = 1; i < lines.length; i++) {
        const currentIndent = lines[i].match(/^\s*/)?.[0].length || 0;
        if (currentIndent > baseIndent || lines[i].trim() === '') codeLines.push(lines[i]);
        else break;
      }
      return codeLines.join('\n').trim();
    }
  } catch (err) {
    // best-effort fallback
  }

  return content.substring(startIndex, Math.min(startIndex + 500, content.length)).trim();
}

/**
 * Extract code sections (functions, classes, or significant blocks) from a file content.
 */
export function extractCodeSections(content: string, language: string): CodeSection[] {
  const sections: CodeSection[] = [];
  try {
    const lines = content.split('\n');

    if (['javascript', 'typescript'].includes(language)) {
      const functionRegex =
        /(?:export\s+default\s+|export\s+)?(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*=\s*(?:<[^>]+>\s*)?(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|class\s+([A-Za-z_$][\w$]*))/g;
      let match: RegExpExecArray | null;
      while ((match = functionRegex.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3] || 'anonymous';
        const startLine = content.substring(0, match.index).split('\n').length;
        const codeBlock = extractCodeBlock(content, match.index, language);
        if (codeBlock) {
          const type = match[3] ? 'class' : 'function';
          sections.push({ name, code: codeBlock, type, lineNumber: startLine });
        }
      }
    }

    if (language === 'python') {
      const functionRegex = /def\s+(\w+)\s*\(/g;
      const classRegex = /class\s+(\w+)\s*\(?/g;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        const startLine = content.substring(0, match.index).split('\n').length;
        const codeBlock = extractCodeBlock(content, match.index, language);
        if (codeBlock) sections.push({ name: match[1], code: codeBlock, type: 'function', lineNumber: startLine });
      }
      while ((match = classRegex.exec(content)) !== null) {
        const startLine = content.substring(0, match.index).split('\n').length;
        const codeBlock = extractCodeBlock(content, match.index, language);
        if (codeBlock) sections.push({ name: match[1], code: codeBlock, type: 'class', lineNumber: startLine });
      }
    }

    // If no functions/classes found, extract significant blocks
    if (sections.length === 0) {
      const significantBlocks = extractSignificantCodeBlocks(content, language);
      significantBlocks.forEach((b, i) => {
        sections.push({ name: `code_block_${i + 1}`, code: b.code, type: 'code block', lineNumber: b.lineNumber });
      });
    }
  } catch (err) {
    // ignore
  }

  return sections;
}

/**
 * Extract large/significant code blocks from content (used as fallback).
 */
export function extractSignificantCodeBlocks(content: string, language: string): Array<{ code: string; lineNumber: number }> {
  const blocks: Array<{ code: string; lineNumber: number }> = [];
  const lines = content.split('\n');

  let currentBlock: string[] = [];
  let currentStartLine = 0;
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (!inBlock && (
      line.length === 0 ||
      line.startsWith('//') ||
      line.startsWith('#') ||
      line.startsWith('import ') ||
      line.startsWith('from ') ||
      line.startsWith('package ') ||
      line.startsWith('using ')
    )) {
      continue;
    }

    if (!inBlock && line.length > 0 && !line.startsWith('//') && !line.startsWith('#')) {
      inBlock = true;
      currentStartLine = i + 1;
      currentBlock = [raw];
    } else if (inBlock) {
      if (line.length === 0 && currentBlock.length >= 5) {
        blocks.push({ code: currentBlock.join('\n'), lineNumber: currentStartLine });
        inBlock = false;
        currentBlock = [];
      } else if (line.length > 0) {
        currentBlock.push(raw);
      }
      if (currentBlock.length >= 30) {
        blocks.push({ code: currentBlock.join('\n'), lineNumber: currentStartLine });
        inBlock = false;
        currentBlock = [];
      }
    }
  }

  if (inBlock && currentBlock.length >= 3) {
    blocks.push({ code: currentBlock.join('\n'), lineNumber: currentStartLine });
  }

  return blocks.slice(0, 5);
}

/**
 * Extract likely programming concepts / tokens from a natural language query.
 */
export function extractConcepts(query: string): string[] {
  if (!query || !query.trim()) return [];
  const canonicalConcepts = [
    'authentication', 'authorization', 'validation', 'database', 'api', 'http',
    'file', 'upload', 'download', 'user', 'login', 'register', 'form', 'input',
    'array', 'list', 'object', 'string', 'number', 'boolean', 'loop', 'iteration',
    'recursion', 'sort', 'search', 'filter', 'map', 'reduce', 'async', 'promise',
    'callback', 'event', 'handler', 'error', 'exception', 'test', 'mock', 'stub'
  ];

  const q = query.toLowerCase();
  const found = canonicalConcepts.filter(c => q.includes(c));
  if (found.length > 0) return found;

  const stopwords = new Set([
    'where', 'can', 'i', 'find', 'the', 'a', 'an', 'how', 'to', 'for', 'of', 'in', 'on', 'is', 'are', 'my', 'that', 'this'
  ]);
  const tokens = q.split(/\W+/).map(t => t.trim()).filter(t => t.length > 1 && !stopwords.has(t));
  const bigrams: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  return Array.from(new Set([...tokens, ...bigrams])).slice(0, 8);
}