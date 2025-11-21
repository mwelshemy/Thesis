import { CodeSnippet } from "./retrieve";
import { calculateCosineSimilarity } from "./similarity";

/**
 * Enhanced ranking with multiple relevance factors
 */
export function rankCandidates(snippets: CodeSnippet[], query?: string): CodeSnippet[] {
  return snippets
    .map(snippet => ({
      ...snippet,
      relevance: calculateOverallRelevance(snippet, query)
    }))
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

function calculateOverallRelevance(snippet: CodeSnippet, query?: string): number {
  let score = snippet.relevance || 0;
  
  // Boost factors
  if (snippet.language === 'typescript' || snippet.language === 'javascript') {
    score *= 1.1; // Prefer JS/TS files
  }
  
  if (snippet.filename.includes('test') || snippet.filename.includes('spec')) {
    score *= 0.7; // Demote test files
  }
  
  if (query && snippet.content.toLowerCase().includes(query.toLowerCase())) {
    score *= 1.2; // Boost exact text matches
  }
  
  // Prefer shorter, more focused snippets
  const contentLength = snippet.content.length;
  if (contentLength > 50 && contentLength < 500) {
    score *= 1.1;
  }
  
  return Math.min(1, Math.max(0, score)); // Clamp between 0-1
}