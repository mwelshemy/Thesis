/**
 * SIMPLE Context Builder - Mock version for testing
 */

export interface EnhancedPrompt {
  basePrompt: string;
  context: string[];
  fullPrompt: string;
}

/**
 * Builds an enhanced prompt with relevant project context
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  selectedCode: string,
  searchResults: any[]
): EnhancedPrompt {
  if (searchResults.length === 0) {
    return {
      basePrompt,
      context: [],
      fullPrompt: `${basePrompt}\n\nSelected Code:\n${selectedCode}`,
    };
  }

  // Simple context building - take top 3 results
  const contextSnippets = searchResults
    .slice(0, 3)
    .map(
      (result: any) =>
        `File: ${result.fileName}\n${result.content.substring(0, 400)}...`
    );

  const contextSection = contextSnippets.join('\n\n');
  const fullPrompt = `${basePrompt}

Selected Code:
${selectedCode}

Relevant Project Context:
${contextSection}

Please analyze considering this context:`;

  return {
    basePrompt,
    context: contextSnippets,
    fullPrompt,
  };
}

/**
 * Simple prompt builder for quick context (fallback)
 */
export function buildSimpleContextPrompt(
  basePrompt: string,
  selectedCode: string,
  searchResults: any[]
): string {
  if (searchResults.length === 0) {
    return `${basePrompt}\n\n${selectedCode}`;
  }

  const context = searchResults
    .slice(0, 2)
    .map(
      (result: any) =>
        `${result.fileName}: ${result.content.substring(0, 200)}...`
    )
    .join('\n');

  return `${basePrompt}

Code: ${selectedCode}

Context: ${context}`;
}
