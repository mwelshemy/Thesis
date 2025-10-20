import { CodeSnippet } from "./retrieve";

/**
 * explaination for this part w kol el integration for the future 

 * rankCandidates()
 * Sorts retrieved snippets by their computed relevance score.
 */
export function rankCandidates(snippets: CodeSnippet[]): CodeSnippet[] {
  return snippets.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
