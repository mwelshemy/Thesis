"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankCandidates = rankCandidates;
const queryUnderstanding_1 = require("./queryUnderstanding");
/**
 * SMART ranking - prioritize content that actually matches the query intent
 */
function rankCandidates(snippets, query) {
    if (!query) {
        return snippets.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
    }
    console.log(`🎯 Smart ranking for: "${query}"`);
    console.log(`📊 Initial semantic score: ${snippets[0]?.relevance?.toFixed(3)}`);
    const queryLower = query.toLowerCase();
    const queryAnalysis = (0, queryUnderstanding_1.analyzeQuery)(queryLower); // Use the imported function
    const ranked = snippets.map(snippet => {
        let score = snippet.relevance || 0;
        const content = snippet.content;
        const contentLower = content.toLowerCase();
        const filePathLower = snippet.filepath.toLowerCase();
        // Use query analysis for smarter boosting
        if (queryAnalysis.isAlgorithmSearch && containsSortingCode(content)) {
            score += 0.8; // Massive boost for actual sorting code
            console.log(`   🚀 MASSIVE BOOST: Found actual sorting code`);
        }
        if (queryAnalysis.isFunctionSearch && isActualFunction(content)) {
            score += 0.3; // Boost for functions when searching for functions
        }
        // Boost for function name containing "sort"
        const functionName = extractFunctionName(content);
        if (functionName && functionName.toLowerCase().includes('sort') && queryLower.includes('sort')) {
            score += 1.0; // Huge boost for functions named "sort"
            console.log(`   🚀 HUGE BOOST: Function name contains "sort": ${functionName}`);
        }
        // Boost for file path containing "sort" or "algorithm"
        if (filePathLower.includes('sort') && queryLower.includes('sort')) {
            score += 0.6;
            console.log(`   📁 File path boost: ${snippet.filepath}`);
        }
        if (filePathLower.includes('algorithm') && queryLower.includes('sort')) {
            score += 0.4;
        }
        // MAJOR FIX: Don't over-boost random functions when searching for specific functionality
        if (queryLower.includes('sort') && !containsSortingCode(content) && !filePathLower.includes('sort')) {
            score -= 0.3; // Penalize non-sorting functions when searching for sorting
            console.log(`   ⚠️  PENALTY: Not sorting-related`);
        }
        // Boost for exact content matches of key terms
        if (contentLower.includes('bubble') && queryLower.includes('sort')) {
            score += 0.5;
        }
        if (contentLower.includes('quick') && queryLower.includes('sort')) {
            score += 0.5;
        }
        if (contentLower.includes('merge') && queryLower.includes('sort')) {
            score += 0.5;
        }
        // Small boost for exact content matches
        if (contentLower.includes(queryLower)) {
            score += 0.1;
        }
        return {
            ...snippet,
            relevance: Math.min(Math.max(score, 0), 1.0) // Keep between 0 and 1
        };
    });
    const results = ranked.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
    console.log(`📊 Final best score: ${results[0]?.relevance?.toFixed(3)}`);
    // Log top results with detailed context
    console.log("🏆 TOP RANKED RESULTS:");
    results.slice(0, 8).forEach((result, index) => {
        const functionName = extractFunctionName(result.content) || 'unknown';
        const isFunc = isActualFunction(result.content);
        const hasSort = containsSortingCode(result.content);
        const fileHasSort = result.filepath.toLowerCase().includes('sort');
        const type = isFunc ? 'FUNCTION' : 'OTHER';
        const sortFlag = hasSort ? '🔍 SORT-RELATED' : fileHasSort ? '📁 IN SORT FILE' : '❌ NOT SORT';
        console.log(`   ${index + 1}. [${type}] ${sortFlag} ${functionName} - ${result.relevance?.toFixed(3)}`);
        console.log(`      File: ${result.filepath}`);
        if (index < 3) {
            console.log(`      Preview: ${result.content.substring(0, 120).replace(/\n/g, ' ')}...`);
        }
    });
    return results;
}
// Improved helper functions
function containsSortingCode(content) {
    const sortingPatterns = [
        /sort\s*\(/, // sort(
        /\.sort\s*\(/, // .sort(
        /bubble.*sort/i, // bubble sort
        /quick.*sort/i, // quick sort  
        /merge.*sort/i, // merge sort
        /insertion.*sort/i, // insertion sort
        /selection.*sort/i, // selection sort
        /heap.*sort/i, // heap sort
        /algorithm.*sort/i, // algorithm sort
        /comparator|compare/i, // comparator function
        /arrange|order.*array/i // arrange/order array
    ];
    return sortingPatterns.some(pattern => pattern.test(content));
}
function isActualFunction(content) {
    const functionPatterns = [
        /function\s+\w+\s*\(/,
        /const\s+\w+\s*=\s*\([^)]*\)\s*=>/,
        /let\s+\w+\s*=\s*\([^)]*\)\s*=>/,
        /var\s+\w+\s*=\s*\([^)]*\)\s*=>/,
        /(?:public|private|protected)?\s+static\s+\w+\(/,
        /static\s+\w+\(/,
        /=>\s*{/
    ];
    return functionPatterns.some(pattern => pattern.test(content));
}
function extractFunctionName(content) {
    // Try to extract function name from various patterns
    const patterns = [
        /function\s+(\w+)\s*\(/,
        /const\s+(\w+)\s*=\s*(?:\([^)]*\)|function)\s*[=>{]/,
        /let\s+(\w+)\s*=\s*(?:\([^)]*\)|function)\s*[=>{]/,
        /var\s+(\w+)\s*=\s*(?:\([^)]*\)|function)\s*[=>{]/,
        /class\s+(\w+)/,
        /interface\s+(\w+)/,
        /type\s+(\w+)/
    ];
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match)
            return match[1];
    }
    return null;
}
//# sourceMappingURL=rank.js.map