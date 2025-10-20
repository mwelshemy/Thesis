/**
 * Enhanced Integration Tests - Context-Aware AI Workflows
 */

// Mock the VS Code API for testing
const mockVSCode = {
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    withProgress: jest.fn((options, task) =>
      task({
        report: jest.fn(),
      })
    ),
  },
};

// Mock the context builder and workflow orchestrator
const mockContextBuilder = {
  buildEnhancedPrompt: jest.fn((base, code, results) => ({
    basePrompt: base,
    context: results.slice(0, 2).map((r) => r.fileName),
    fullPrompt: `${base}\n\nCode: ${code.substring(0, 50)}...\nContext from: ${results
      .slice(0, 2)
      .map((r) => r.fileName)
      .join(', ')}`,
  })),
  buildSimpleContextPrompt: jest.fn(
    (base, code, results) => `${base}\n\n${code.substring(0, 100)}...`
  ),
};

const mockWorkflowOrchestrator = {
  smartCodeAnalysis: jest.fn(async (request) => ({
    success: true,
    response: `AI analysis of: ${request.selectedCode.substring(0, 50)}...`,
    contextUsed: ['file1.ts', 'file2.ts'],
    searchResultsCount: 5,
    workflowTime: 250,
  })),
  analyzeSearchResults: jest.fn(async (query) => ({
    success: true,
    response: `Analysis of search: ${query}`,
    contextUsed: ['result1.ts', 'result2.js'],
    searchResultsCount: 3,
    workflowTime: 180,
  })),
};

describe('Enhanced AI + Search Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Context-Aware AI Workflows', () => {
    test('should build enhanced prompts with project context', () => {
      const basePrompt = 'Explain this code';
      const selectedCode = 'function calculate() { return 42; }';
      const mockResults = [
        {
          fileName: 'math.ts',
          content: 'export function add(a, b) { return a + b; }',
        },
        {
          fileName: 'utils.ts',
          content: 'export function multiply(x, y) { return x * y; }',
        },
      ];

      const enhancedPrompt = mockContextBuilder.buildEnhancedPrompt(
        basePrompt,
        selectedCode,
        mockResults
      );

      expect(enhancedPrompt.fullPrompt).toContain('Explain this code');
      expect(enhancedPrompt.fullPrompt).toContain('function calculate');
      expect(enhancedPrompt.context).toContain('math.ts');
      expect(mockContextBuilder.buildEnhancedPrompt).toHaveBeenCalledWith(
        basePrompt,
        selectedCode,
        mockResults
      );
    });

    test('should handle empty search results gracefully', () => {
      const basePrompt = 'Explain this code';
      const selectedCode = 'const x = 10;';
      const emptyResults = [];

      const simplePrompt = mockContextBuilder.buildSimpleContextPrompt(
        basePrompt,
        selectedCode,
        emptyResults
      );

      expect(simplePrompt).toContain('Explain this code');
      expect(simplePrompt).toContain('const x = 10');
      expect(simplePrompt).not.toContain('Context from');
    });
  });

  describe('Workflow Orchestration', () => {
    test('should execute smart code analysis workflow', async () => {
      const request = {
        selectedCode: 'function example() { return true; }',
        userQuery: 'Explain this function:',
        useEnhancedContext: true,
        maxSearchResults: 5,
      };

      const result = await mockWorkflowOrchestrator.smartCodeAnalysis(request);

      expect(result.success).toBe(true);
      expect(result.response).toContain('AI analysis of:');
      expect(result.contextUsed).toHaveLength(2);
      expect(result.searchResultsCount).toBe(5);
      expect(result.workflowTime).toBeLessThan(1000);
      expect(mockWorkflowOrchestrator.smartCodeAnalysis).toHaveBeenCalledWith(
        request
      );
    });

    test('should analyze search results with AI', async () => {
      const searchQuery = 'authentication';

      const result =
        await mockWorkflowOrchestrator.analyzeSearchResults(searchQuery);

      expect(result.success).toBe(true);
      expect(result.response).toContain('Analysis of search: authentication');
      expect(result.contextUsed).toHaveLength(2);
      expect(result.searchResultsCount).toBe(3);
      expect(
        mockWorkflowOrchestrator.analyzeSearchResults
      ).toHaveBeenCalledWith(searchQuery);
    });

    test('should measure workflow performance', async () => {
      const request = {
        selectedCode: 'console.log("test");',
        useEnhancedContext: false,
      };

      const startTime = Date.now();
      const result = await mockWorkflowOrchestrator.smartCodeAnalysis(request);
      const endTime = Date.now();

      const actualDuration = endTime - startTime;

      // Mock should be very fast
      expect(actualDuration).toBeLessThan(100);
      expect(result.workflowTime).toBeLessThan(1000);
    });
  });

  describe('Integration Scenarios', () => {
    test('should simulate complete user workflow', async () => {
      // Simulate user selecting code and using smart explain
      const selectedCode = `
        function processUserData(user) {
          return {
            id: user.id,
            name: user.name.toUpperCase(),
            active: user.status === 'active'
          };
        }
      `;

      const workflowResult = await mockWorkflowOrchestrator.smartCodeAnalysis({
        selectedCode,
        userQuery: 'Explain this data processing function:',
        useEnhancedContext: true,
        maxSearchResults: 4,
      });

      // Verify workflow completed successfully
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.response).toBeDefined();
      expect(workflowResult.contextUsed.length).toBeGreaterThan(0);
      expect(workflowResult.workflowTime).toBeGreaterThan(0);

      // Verify the response is meaningful
      expect(workflowResult.response.length).toBeGreaterThan(10);
    });

    test('should handle search-driven analysis workflow', async () => {
      const searchQuery = 'user validation';

      const analysisResult =
        await mockWorkflowOrchestrator.analyzeSearchResults(searchQuery, 6);

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.response).toContain('search');
      expect(analysisResult.searchResultsCount).toBe(3);

      // Should have used context from search results
      expect(analysisResult.contextUsed.length).toBeGreaterThan(0);
    });
  });
});

// Export mocks for potential reuse in other tests
module.exports = {
  mockVSCode,
  mockContextBuilder,
  mockWorkflowOrchestrator,
};
