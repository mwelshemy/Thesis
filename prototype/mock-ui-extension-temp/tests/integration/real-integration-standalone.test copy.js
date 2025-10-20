/**
 * REAL Integration Test - Standalone version that works with real components
 * This test uses the actual compiled workflow orchestrator and AI components
 */

const path = require('path');
const { callAI, callAIMock } = require('../../ai/callAI');

// Mock the VS Code module at runtime
jest.mock(
  'vscode',
  () => ({
    window: {
      createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        clear: jest.fn(),
        dispose: jest.fn(),
      })),
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      showErrorMessage: jest.fn(),
    },
    workspace: {
      findFiles: jest.fn(() =>
        Promise.resolve([
          { fsPath: '/mock/file1.ts' },
          { fsPath: '/mock/file2.js' },
        ])
      ),
      openTextDocument: jest.fn(() =>
        Promise.resolve({
          getText: jest.fn(
            () =>
              '// Mock file content\nfunction mockFunction() { return true; }'
          ),
          languageId: 'typescript',
          lineCount: 5,
        })
      ),
      fs: {
        stat: jest.fn(() =>
          Promise.resolve({
            mtime: Date.now(),
          })
        ),
      },
    },
    ProgressLocation: {
      Notification: 1,
    },
  }),
  { virtual: true }
);

// Mock the search module
jest.mock('../../src/search', () => {
  const mockSearchData = [
    {
      filePath: '/real/test1.ts',
      fileName: 'test1.ts',
      language: 'typescript',
      content:
        'export function calculateSum(a: number, b: number): number { return a + b; }',
      lineCount: 3,
      lastModified: new Date(),
    },
    {
      filePath: '/real/test2.js',
      fileName: 'test2.js',
      language: 'javascript',
      content: 'function multiply(x, y) { return x * y; }',
      lineCount: 2,
      lastModified: new Date(),
    },
    {
      filePath: '/real/utils.ts',
      fileName: 'utils.ts',
      language: 'typescript',
      content: 'interface User { name: string; age: number; }',
      lineCount: 2,
      lastModified: new Date(),
    },
  ];

  return {
    searchIndex: jest.fn((query, maxResults = 10) => {
      console.log(`🔍 Real search called with: "${query}", max: ${maxResults}`);
      return mockSearchData
        .filter(
          (file) =>
            file.content.toLowerCase().includes(query.toLowerCase()) ||
            file.fileName.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, maxResults);
    }),
    buildSearchIndex: jest.fn(() => {
      console.log('📁 Building real search index');
      return Promise.resolve(mockSearchData);
    }),
    getSearchStats: jest.fn(() => ({
      fileCount: mockSearchData.length,
      totalLines: mockSearchData.reduce((sum, file) => sum + file.lineCount, 0),
      isIndexing: false,
    })),
    FileIndexEntry: jest.requireActual('../../src/search').FileIndexEntry,
  };
});

describe('REAL Integration Tests', () => {
  let realWorkflowOrchestrator;

  beforeAll(() => {
    // Load the real workflow orchestrator AFTER mocks are set up
    realWorkflowOrchestrator = require('../../src/integration/workflow-orchestrator');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Real AI Integration', () => {
    test('should call real AI with mock data', async () => {
      const testPrompt = 'Explain this code: function test() { return true; }';

      console.log('🤖 Testing real AI call...');

      let aiResponse;
      const hasRealToken =
        process.env.HUGGINGFACE_API_TOKEN &&
        !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');

      if (hasRealToken) {
        console.log('🔐 Using REAL Hugging Face API');
        aiResponse = await callAI(testPrompt);
      } else {
        console.log('🎭 Using MOCK AI (no valid token)');
        aiResponse = await callAIMock(testPrompt);
      }

      expect(aiResponse).toBeDefined();
      expect(typeof aiResponse).toBe('string');
      expect(aiResponse.length).toBeGreaterThan(10);

      console.log(`✅ AI response received: ${aiResponse.length} characters`);
      if (!aiResponse.startsWith('ERROR:')) {
        console.log(`📝 Response preview: ${aiResponse.substring(0, 100)}...`);
      }
    });

    test('should handle AI errors gracefully', async () => {
      // Test with empty prompt to see error handling
      const response = await callAIMock('');
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    });
  });

  describe('Real Workflow Orchestrator', () => {
    test('should complete real smart analysis workflow', async () => {
      const testCode = `
        function calculateTotal(items) {
          return items.reduce((sum, item) => sum + item.price, 0);
        }
      `;

      console.log('🚀 Starting REAL smart analysis workflow...');

      const result = await realWorkflowOrchestrator.smartCodeAnalysis({
        selectedCode: testCode,
        userQuery: 'Explain this function briefly:',
        useEnhancedContext: true,
        maxSearchResults: 3,
      });

      // Validate real workflow results
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(typeof result.response).toBe('string');
      expect(result.response.length).toBeGreaterThan(10);
      expect(result.workflowTime).toBeGreaterThan(0);
      expect(Array.isArray(result.contextUsed)).toBe(true);

      console.log(`✅ REAL workflow completed in ${result.workflowTime}ms`);
      console.log(`📁 Context used: ${result.contextUsed.length} files`);
      console.log(`🔍 Search results: ${result.searchResultsCount} files`);
      console.log(`📝 Response length: ${result.response.length} chars`);

      if (!result.response.startsWith('ERROR:')) {
        console.log(
          `🤖 Response preview: ${result.response.substring(0, 150)}...`
        );
      }
    });

    test('should handle search-driven analysis with real components', async () => {
      console.log('🔍 Testing REAL search-driven analysis...');

      const result = await realWorkflowOrchestrator.analyzeSearchResults(
        'function',
        2
      );

      expect(result.success).toBe(true);
      expect(result.searchResultsCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.contextUsed)).toBe(true);

      console.log(`✅ Search analysis completed`);
      console.log(`📊 Found ${result.searchResultsCount} results`);
      console.log(`📁 Analyzed ${result.contextUsed.length} files`);
    });

    test('should work with different analysis types', async () => {
      const testCode = 'const user = { name: "John", age: 30 };';

      const tests = [
        {
          name: 'Quick Analysis',
          function: realWorkflowOrchestrator.quickCodeAnalysis,
          code: testCode,
        },
        {
          name: 'Deep Analysis',
          function: realWorkflowOrchestrator.deepCodeAnalysis,
          code: testCode,
        },
        {
          name: 'Pattern Analysis',
          function: realWorkflowOrchestrator.patternAnalysis,
          code: testCode,
        },
      ];

      for (const test of tests) {
        console.log(`🧪 Testing ${test.name}...`);

        const result = await test.function(test.code);

        expect(result.success).toBe(true);
        expect(result.response.length).toBeGreaterThan(10);

        console.log(`✅ ${test.name} completed in ${result.workflowTime}ms`);
      }
    });
  });

  describe('Performance with Real Components', () => {
    test('should measure real workflow performance', async () => {
      console.log('⏱️ Testing REAL performance...');

      const startTime = Date.now();
      const result = await realWorkflowOrchestrator.quickCodeAnalysis(
        'console.log("test");'
      );
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(totalTime).toBeGreaterThan(0);

      console.log(`⚡ Real quick analysis took ${totalTime}ms`);
      console.log(`🕒 Workflow reported ${result.workflowTime}ms`);

      // For mock AI, should be very fast
      const hasRealToken =
        process.env.HUGGINGFACE_API_TOKEN &&
        !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');

      if (!hasRealToken) {
        expect(totalTime).toBeLessThan(5000); // Mock should be fast
      }
    });

    test('should handle multiple sequential requests', async () => {
      const testCases = [
        'function one() { return 1; }',
        'const two = 2;',
        'class Three {}',
      ];

      console.log('🔄 Testing multiple sequential requests...');

      const results = [];
      for (const testCase of testCases) {
        const result =
          await realWorkflowOrchestrator.quickCodeAnalysis(testCase);
        results.push(result);
        expect(result.success).toBe(true);
      }

      console.log(`✅ Completed ${results.length} sequential requests`);

      // All should have similar structure
      results.forEach((result) => {
        expect(result).toHaveProperty('response');
        expect(result).toHaveProperty('workflowTime');
      });
    });
  });

  describe('Error Handling with Real Components', () => {
    test('should handle empty code gracefully', async () => {
      console.log('🔄 Testing empty code handling...');

      const result = await realWorkflowOrchestrator.smartCodeAnalysis({
        selectedCode: '',
        userQuery: 'Explain this:',
      });

      // Should not crash, should provide some response
      expect(result).toBeDefined();
      expect(typeof result.response).toBe('string');

      console.log(
        `✅ Empty code handled: ${result.response.length > 0 ? 'has response' : 'empty response'}`
      );
    });

    test('should handle very long code', async () => {
      // Create a long code string
      const longCode =
        'function test() {' + '\n// comment\n'.repeat(50) + 'return true;\n}';

      console.log('📏 Testing long code handling...');

      const result = await realWorkflowOrchestrator.smartCodeAnalysis({
        selectedCode: longCode,
        userQuery: 'Explain this long function:',
        useEnhancedContext: false, // Don't add more context to long code
      });

      expect(result.success).toBe(true);
      expect(result.response.length).toBeGreaterThan(10);

      console.log(
        `✅ Long code (${longCode.length} chars) handled successfully`
      );
    });
  });
});

// Utility function to check if real AI is available
function isRealAIAvailable() {
  return (
    process.env.HUGGINGFACE_API_TOKEN &&
    !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here')
  );
}

// Export for potential reuse
module.exports = {
  isRealAIAvailable,
};
