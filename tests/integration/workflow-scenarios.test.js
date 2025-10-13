/**
 * Workflow Scenario Tests - Plain JavaScript
 */

describe('User Workflow Scenarios', () => {
  test('should build prompts with context', () => {
    const basePrompt = "Explain this code";
    const context = ["file1.ts content", "file2.ts content"];
    
    const enhancedPrompt = basePrompt + "\n\nContext:\n" + context.join('\n');
    
    expect(enhancedPrompt).toContain("Explain this code");
    expect(enhancedPrompt).toContain("Context:");
    expect(enhancedPrompt).toContain("file1.ts content");
  });

  test('should handle empty context', () => {
    const basePrompt = "Explain this code";
    const context = [];
    
    let result;
    if (context.length > 0) {
      result = basePrompt + "\n\nContext:\n" + context.join('\n');
    } else {
      result = basePrompt;
    }
    
    expect(result).toBe("Explain this code");
  });

  test('should format search results', () => {
    const mockResults = [
      { fileName: 'test.ts', content: 'function test() {}' },
      { fileName: 'utils.ts', content: 'export function helper() {}' }
    ];
    
    const formatted = mockResults.map(function(r) {
      return r.fileName + ': ' + r.content;
    }).join('\n');
    
    expect(formatted).toContain('test.ts');
    expect(formatted).toContain('utils.ts');
    expect(formatted).toContain('function test()');
  });
});

describe('Integration Helpers', () => {
  test('should merge AI and search data', () => {
    const searchData = { files: ['a.ts', 'b.ts'] };
    const aiData = { response: 'Explanation' };
    
    const merged = Object.assign({}, searchData, aiData);
    
    expect(merged.files).toEqual(['a.ts', 'b.ts']);
    expect(merged.response).toBe('Explanation');
  });

  test('should calculate performance metrics', () => {
    const startTime = 1000;
    const endTime = 1500;
    const duration = endTime - startTime;
    
    expect(duration).toBe(500);
    expect(duration).toBeLessThan(1000);
  });
});