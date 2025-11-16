"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smartCodeAnalysis = smartCodeAnalysis;
exports.quickCodeAnalysis = quickCodeAnalysis;
exports.deepCodeAnalysis = deepCodeAnalysis;
exports.patternAnalysis = patternAnalysis;
exports.analyzeSearchResults = analyzeSearchResults;
exports.performanceTest = performanceTest;
const callAI_1 = require("../ai/callAI");
const search_1 = require("../search");
const context_builder_1 = require("./context-builder");
async function smartCodeAnalysis(request) {
    const startTime = Date.now();
    try {
        console.log('🚀 Starting smart code analysis workflow...');
        await (0, search_1.buildSearchIndex)();
        console.log('✅ Search index ready');
        const searchQuery = generateSearchQuery(request.selectedCode, request.userQuery);
        console.log(`🔍 Searching for: "${searchQuery}"`);
        const searchResults = (0, search_1.searchIndex)(searchQuery, request.maxSearchResults || 10);
        console.log(`📁 Found ${searchResults.length} relevant files`);
        const basePrompt = request.userQuery || 'Please analyze this code:';
        let enhancedPrompt;
        let contextUsed = [];
        if (request.useEnhancedContext && searchResults.length > 0) {
            const enhanced = (0, context_builder_1.buildEnhancedPrompt)(basePrompt, request.selectedCode, searchResults);
            enhancedPrompt = enhanced.fullPrompt;
            contextUsed = enhanced.context;
            console.log(`📝 Built enhanced prompt with ${contextUsed.length} context files`);
        }
        else {
            enhancedPrompt = (0, context_builder_1.buildSimpleContextPrompt)(basePrompt, request.selectedCode, searchResults);
            contextUsed = searchResults.slice(0, 3).map((r) => r.fileName);
            console.log('📝 Using simple prompt format');
        }
        console.log('🤖 Calling AI with enhanced context...');
        let aiResponse;
        const hasAIToken = process.env.HUGGINGFACE_API_TOKEN &&
            !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');
        if (hasAIToken) {
            console.log('🔐 Using real Hugging Face API');
            aiResponse = await (0, callAI_1.callAI)(enhancedPrompt);
        }
        else {
            console.log('🎭 Using mock AI response (no valid token found)');
            aiResponse = await (0, callAI_1.callAIMock)(enhancedPrompt);
        }
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
    }
    catch (error) {
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
function generateSearchQuery(selectedCode, userQuery) {
    if (userQuery) {
        return userQuery;
    }
    const lines = selectedCode.split('\n').slice(0, 5);
    const terms = new Set();
    lines.forEach((line) => {
        const functionMatch = line.match(/(function|const|let|var)\s+(\w+)/);
        if (functionMatch && functionMatch[2]) {
            terms.add(functionMatch[2]);
        }
        const classMatch = line.match(/(class|interface)\s+(\w+)/);
        if (classMatch && classMatch[2]) {
            terms.add(classMatch[2]);
        }
        const importMatch = line.match(/(import|export).*?from\s+['"]([^'"]+)['"]/);
        if (importMatch && importMatch[2]) {
            terms.add(importMatch[2].split('/').pop() || '');
        }
    });
    const validTerms = Array.from(terms).filter(term => term && term.length > 2).slice(0, 3);
    if (validTerms.length > 0) {
        return validTerms.join(' ');
    }
    if (selectedCode.includes('function'))
        return 'function';
    if (selectedCode.includes('class'))
        return 'class';
    if (selectedCode.includes('interface'))
        return 'interface';
    return 'code pattern';
}
async function quickCodeAnalysis(selectedCode) {
    return smartCodeAnalysis({
        selectedCode,
        userQuery: 'Explain this code briefly and clearly:',
        useEnhancedContext: false,
        maxSearchResults: 3,
    });
}
async function deepCodeAnalysis(selectedCode) {
    return smartCodeAnalysis({
        selectedCode,
        userQuery: 'Analyze this code in depth, considering project patterns, architecture, and best practices. Provide detailed insights:',
        useEnhancedContext: true,
        maxSearchResults: 8,
    });
}
async function patternAnalysis(selectedCode) {
    return smartCodeAnalysis({
        selectedCode,
        userQuery: 'Find and explain similar patterns in this project. Compare approaches and suggest improvements:',
        useEnhancedContext: true,
        maxSearchResults: 6,
    });
}
async function analyzeSearchResults(searchQuery, maxResults = 5) {
    const startTime = Date.now();
    try {
        console.log(`🔍 Analyzing search results for: "${searchQuery}"`);
        const searchResults = (0, search_1.searchIndex)(searchQuery, maxResults);
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
        const resultsSummary = searchResults
            .map((result, index) => `--- Result ${index + 1} ---\nFile: ${result.fileName}\nLanguage: ${result.language}\nContent:\n${result.content.substring(0, 400)}...`)
            .join('\n\n');
        const analysisPrompt = `Analyze these search results for "${searchQuery}" and provide comprehensive insights:

${resultsSummary}

Please analyze:
1. Common patterns and themes across these files
2. Code quality and consistency observations
3. Potential improvements or refactoring suggestions
4. Any notable architecture or design patterns`;
        let aiResponse;
        const hasAIToken = process.env.HUGGINGFACE_API_TOKEN &&
            !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');
        if (hasAIToken) {
            aiResponse = await (0, callAI_1.callAI)(analysisPrompt);
        }
        else {
            aiResponse = await (0, callAI_1.callAIMock)(analysisPrompt);
        }
        const workflowTime = Date.now() - startTime;
        return {
            success: true,
            response: aiResponse,
            contextUsed: searchResults.map((r) => r.fileName),
            searchResultsCount: searchResults.length,
            workflowTime,
        };
    }
    catch (error) {
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
async function performanceTest(testCode = 'function test() { return "test"; }') {
    const startTime = Date.now();
    try {
        console.log('⏱️ Running performance test...');
        const searchStart = Date.now();
        await (0, search_1.buildSearchIndex)();
        const searchResults = (0, search_1.searchIndex)('function', 5);
        const searchTime = Date.now() - searchStart;
        const aiStart = Date.now();
        const hasAIToken = process.env.HUGGINGFACE_API_TOKEN &&
            !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here');
        let aiResponse;
        if (hasAIToken) {
            aiResponse = await (0, callAI_1.callAI)('Quick test: ' + testCode);
        }
        else {
            aiResponse = await (0, callAI_1.callAIMock)('Quick test: ' + testCode);
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
    }
    catch (error) {
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
//# sourceMappingURL=workflow-orchestrator.js.map