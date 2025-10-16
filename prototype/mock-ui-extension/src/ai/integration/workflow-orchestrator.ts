/**
 * REAL Workflow Orchestrator for AI + Search Integration
 * Now with actual AI and Search component integration
 */

import { callAI, callAIMock } from '../callAI';
import { searchIndex, buildSearchIndex, FileIndexEntry } from '../../search';
import { buildEnhancedPrompt, buildSimpleContextPrompt } from './context-builder';

export interface WorkflowResult {
  success: boolean;
  response: string;
  contextUsed: string[];
  searchResultsCount: number;
  workflowTime: number;
  error?: string;
}

export interface AnalysisRequest {
  selectedCode: string;
  userQuery?: string;
  useEnhancedContext?: boolean;
  maxSearchResults?: number;
}

/**
 * Main workflow: Smart code analysis with project context
 */
export async function smartCodeAnalysis(
  request: AnalysisRequest
): Promise<WorkflowResult> {
  const startTime = Date.now();

  try {
    console.log('🚀 Starting smart code analysis workflow...');

    // Step 1: Ensure search index is built
    await buildSearchIndex();
    console.log('✅ Search index ready');

    // Step 2: Search for relevant context
    const searchQuery = generateSearchQuery(request.selectedCode, request.userQuery);
    console.log(`🔍 Searching for: "${searchQuery}"`);

    const searchResults = searchIndex(searchQuery, request.maxSearchResults || 10);
    console.log(`📁 Found ${searchResults.length} relevant files`);

    // Step 3: Build enhanced prompt using real context builder
    const basePrompt = request.userQuery || 'Please analyze this code:';
    let enhancedPrompt: string;
    let contextUsed: string[] = [];

    if (request.useEnhancedContext && searchResults.length > 0) {
      const enhanced = buildEnhancedPrompt(basePrompt, request.selectedCode, searchResults);
      enhancedPrompt = enhanced.fullPrompt;
      contextUsed = enhanced.context;
      console.log(`📝 Built enhanced prompt with ${contextUsed.length} context files`);
    } else {
      enhancedPrompt = buildSimpleContextPrompt(basePrompt, request.selectedCode, searchResults);
      contextUsed = searchResults.slice(0, 3).map((r: any) => r.fileName);
      console.log('📝 Using simple prompt format');
    }

    // Step 4: Call REAL AI with enhanced context
    console.log('🤖 Calling AI with enhanced context...');
    let aiResponse: string;

    // Use real AI if token available, otherwise use mock with warning
    const hasAIToken = process.env.HUGGINGFACE_API_TOKEN &&
      !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');

    if (hasAIToken) {
      console.log('🔐 Using real Hugging Face API');
      aiResponse = await callAI(enhancedPrompt);
    } else {
      console.log('🎭 Using mock AI response (no valid token found)');
      aiResponse = await callAIMock(enhancedPrompt);
    }

    // Step 5: Handle AI response
    if (aiResponse.startsWith('ERROR:')) {
      throw new Error(`AI call failed: ${aiResponse}`);
    }

    const workflowTime = Date.now() - startTime;

    console.log(`✅ Workflow completed in ${workflowTime}ms`);

    return {
      success: true,
      response: aiResponse,
      contextUsed,
      searchResultsCount: searchResults.length,
      workflowTime,
    };
  } catch (error: any) {
    const workflowTime = Date.now() - startTime;
    console.error('❌ Workflow failed:', error);

    return {
      success: false,
      response: `Workflow error: ${error.message}`,
      contextUsed: [],
      searchResultsCount: 0,
      workflowTime,
      error: error.message
    };
  }
}

/**
 * Generate intelligent search query from code and user input
 */
function generateSearchQuery(selectedCode: string, userQuery?: string): string {
  if (userQuery) {
    return userQuery;
  }

  // Extract potential search terms from code
  const lines = selectedCode.split('\n').slice(0, 5);
  const terms = new Set<string>();

  lines.forEach((line) => {
    // Look for function names, variables, etc.
    const functionMatch = line.match(/(function|const|let|var)\s+(\w+)/);
    if (functionMatch && functionMatch[2]) {
      terms.add(functionMatch[2]);
    }

    // Look for class/interface names
    const classMatch = line.match(/(class|interface)\s+(\w+)/);
    if (classMatch && classMatch[2]) {
      terms.add(classMatch[2]);
    }

    // Look for imports and exports
    const importMatch = line.match(/(import|export).*?from\s+['"]([^'"]+)['"]/);
    if (importMatch && importMatch[2]) {
      terms.add(importMatch[2].split('/').pop() || '');
    }
  });

  // Filter out empty terms and take top 3
  const validTerms = Array.from(terms).filter(term => term && term.length > 2).slice(0, 3);

  if (validTerms.length > 0) {
    return validTerms.join(' ');
  }

  // Fallback to code structure analysis
  if (selectedCode.includes('function')) return 'function';
  if (selectedCode.includes('class')) return 'class';
  if (selectedCode.includes('interface')) return 'interface';

  return 'code pattern';
}

/**
 * Quick analysis workflow for simple explanations
 */
export async function quickCodeAnalysis(
  selectedCode: string
): Promise<WorkflowResult> {
  return smartCodeAnalysis({
    selectedCode,
    userQuery: 'Explain this code briefly and clearly:',
    useEnhancedContext: false,
    maxSearchResults: 3,
  });
}

/**
 * Deep analysis workflow with full project context
 */
export async function deepCodeAnalysis(
  selectedCode: string
): Promise<WorkflowResult> {
  return smartCodeAnalysis({
    selectedCode,
    userQuery: 'Analyze this code in depth, considering project patterns, architecture, and best practices. Provide detailed insights:',
    useEnhancedContext: true,
    maxSearchResults: 8,
  });
}

/**
 * Pattern analysis workflow - find similar patterns in project
 */
export async function patternAnalysis(
  selectedCode: string
): Promise<WorkflowResult> {
  return smartCodeAnalysis({
    selectedCode,
    userQuery: 'Find and explain similar patterns in this project. Compare approaches and suggest improvements:',
    useEnhancedContext: true,
    maxSearchResults: 6,
  });
}

/**
 * Search-driven analysis - analyze search results with AI
 */
export async function analyzeSearchResults(
  searchQuery: string,
  maxResults: number = 5
): Promise<WorkflowResult> {
  const startTime = Date.now();

  try {
    console.log(`🔍 Analyzing search results for: "${searchQuery}"`);

    // Step 1: Search for the query using real search
    const searchResults = searchIndex(searchQuery, maxResults);
    console.log(`📊 Found ${searchResults.length} search results`);

    if (searchResults.length === 0) {
      return {
        success: true,
        response: `No results found for "${searchQuery}". Try a different search term or check if files are indexed.`,
        contextUsed: [],
        searchResultsCount: 0,
        workflowTime: Date.now() - startTime,
      };
    }

    // Step 2: Build analysis prompt from real search results
    const resultsSummary = searchResults
      .map(
        (result: any, index: number) =>
          `--- Result ${index + 1} ---\nFile: ${result.fileName}\nLanguage: ${result.language}\nContent:\n${result.content.substring(0, 400)}...`
      )
      .join('\n\n');

    const analysisPrompt = `Analyze these search results for "${searchQuery}" and provide comprehensive insights:

${resultsSummary}

Please analyze:
1. Common patterns and themes across these files
2. Code quality and consistency observations
3. Potential improvements or refactoring suggestions
4. Any notable architecture or design patterns`;

    // Step 3: Call REAL AI for analysis
    let aiResponse: string;
    const hasAIToken = process.env.HUGGINGFACE_API_TOKEN &&
      !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');

    if (hasAIToken) {
      aiResponse = await callAI(analysisPrompt);
    } else {
      aiResponse = await callAIMock(analysisPrompt);
    }

    const workflowTime = Date.now() - startTime;

    return {
      success: true,
      response: aiResponse,
      contextUsed: searchResults.map((r: any) => r.fileName),
      searchResultsCount: searchResults.length,
      workflowTime,
    };
  } catch (error: any) {
    const workflowTime = Date.now() - startTime;

    return {
      success: false,
      response: `Analysis failed: ${error.message}`,
      contextUsed: [],
      searchResultsCount: 0,
      workflowTime,
      error: error.message
    };
  }
}

/**
 * Performance test workflow - measure integration performance
 */
export async function performanceTest(
  testCode: string = 'function test() { return "test"; }'
): Promise<WorkflowResult> {
  const startTime = Date.now();

  try {
    console.log('⏱️ Running performance test...');

    // Test search performance
    const searchStart = Date.now();
    await buildSearchIndex();
    const searchResults = searchIndex('function', 5);
    const searchTime = Date.now() - searchStart;

    // Test AI performance
    const aiStart = Date.now();
    const hasAIToken = process.env.HUGGINGFACE_API_TOKEN &&
      !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');
    let aiResponse: string;

    if (hasAIToken) {
      aiResponse = await callAI('Quick test: ' + testCode);
    } else {
      aiResponse = await callAIMock('Quick test: ' + testCode);
    }
    const aiTime = Date.now() - aiStart;

    const totalTime = Date.now() - startTime;

    const performanceReport = `Performance Test Results:
⏱️ Total Time: ${totalTime}ms
🔍 Search Time: ${searchTime}ms (${searchResults.length} files)
🤖 AI Time: ${aiTime}ms
📊 Files Indexed: ${searchResults.length}

${hasAIToken ? '✅ Using real AI API' : '🎭 Using mock AI (set HUGGINGFACE_API_TOKEN for real performance)'}`;

    return {
      success: true,
      response: performanceReport,
      contextUsed: [],
      searchResultsCount: searchResults.length,
      workflowTime: totalTime,
    };
  } catch (error: any) {
    const workflowTime = Date.now() - startTime;

    return {
      success: false,
      response: `Performance test failed: ${error.message}`,
      contextUsed: [],
      searchResultsCount: 0,
      workflowTime,
    };
  }
}