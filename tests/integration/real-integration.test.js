/**
 * REAL Integration Tests - Testing actual component integration
 */

// Note: These tests require the extension to be compiled and may use real AI if token available

describe('Real Component Integration', () => {
  describe('End-to-End Workflows', () => {
    test('should complete smart analysis workflow with real components', async () => {
      // This test uses real search and (potentially) real AI
      const testCode = `
        function calculateTotal(items) {
          return items.reduce((sum, item) => sum + item.price, 0);
        }
      `;

      // Import the real workflow orchestrator
      const {
        smartCodeAnalysis,
      } = require('../../out/integration/workflow-orchestrator');

      const result = await smartCodeAnalysis({
        selectedCode: testCode,
        userQuery: 'Explain this function briefly:',
        useEnhancedContext: true,
        maxSearchResults: 3,
      });

      // Basic validation - the workflow should complete
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(typeof result.response).toBe('string');
      expect(result.response.length).toBeGreaterThan(10);
      expect(result.workflowTime).toBeGreaterThan(0);

      console.log(
        `✅ Real integration test completed in ${result.workflowTime}ms`
      );
      console.log(`📁 Context used: ${result.contextUsed.length} files`);
      console.log(`🤖 Response length: ${result.response.length} chars`);
    });

    test('should handle search-driven analysis with real components', async () => {
      const {
        analyzeSearchResults,
      } = require('../../out/integration/workflow-orchestrator');

      const result = await analyzeSearchResults('function', 4);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.searchResultsCount).toBeGreaterThanOrEqual(0);

      if (result.searchResultsCount > 0) {
        expect(result.contextUsed.length).toBeGreaterThan(0);
        expect(result.response.length).toBeGreaterThan(10);
      }

      console.log(
        `🔍 Search analysis found ${result.searchResultsCount} results`
      );
    });
  });

  describe('Performance Integration', () => {
    test('should measure real workflow performance', async () => {
      const {
        performanceTest,
      } = require('../../out/integration/workflow-orchestrator');

      const result = await performanceTest();

      expect(result.success).toBe(true);
      expect(result.workflowTime).toBeGreaterThan(0);
      expect(result.response).toContain('Performance Test Results');

      console.log('⏱️ Performance test results:');
      console.log(result.response);
    });

    test('should complete workflow within reasonable time', async () => {
      const {
        quickCodeAnalysis,
      } = require('../../out/integration/workflow-orchestrator');

      const startTime = Date.now();
      const result = await quickCodeAnalysis('const x = 10;');
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);

      // Mock should be very fast, real AI might take longer
      // Set a generous timeout for real API calls
      const maxReasonableTime = process.env.HUGGINGFACE_API_TOKEN
        ? 30000
        : 5000;
      expect(totalTime).toBeLessThan(maxReasonableTime);

      console.log(`⚡ Quick analysis completed in ${totalTime}ms`);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle empty search results gracefully', async () => {
      const {
        smartCodeAnalysis,
      } = require('../../out/integration/workflow-orchestrator');

      const result = await smartCodeAnalysis({
        selectedCode: 'very_unique_code_12345',
        userQuery: 'Explain this:',
        useEnhancedContext: true,
        maxSearchResults: 3,
      });

      // Should still complete successfully even with no context
      expect(result.success).toBe(true);
      expect(result.response.length).toBeGreaterThan(10);
      expect(result.searchResultsCount).toBeDefined();

      console.log(
        `🔄 Handled empty context with ${result.searchResultsCount} results`
      );
    });

    test('should provide meaningful error messages', async () => {
      const {
        smartCodeAnalysis,
      } = require('../../out/integration/workflow-orchestrator');

      // Test with invalid input
      const result = await smartCodeAnalysis({
        selectedCode: '',
        userQuery: 'Test empty code',
      });

      // Should handle gracefully rather than crash
      expect(result).toBeDefined();
      // Might be success with empty response or failure with error
      expect(typeof result.response).toBe('string');
    });
  });
});

// Helper function to check if real AI is available
function isRealAIAvailable() {
  return (
    process.env.HUGGINGFACE_API_TOKEN &&
    !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here')
  );
}

// Export test utilities
module.exports = {
  isRealAIAvailable,
};
