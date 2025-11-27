"use strict";
/**
 * Enhanced query understanding for better code search
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeQuery = analyzeQuery;
function analyzeQuery(query) {
    const lowerQuery = query.toLowerCase();
    const analysis = {
        mainIntent: extractMainIntent(lowerQuery),
        codeConcepts: extractCodeConcepts(lowerQuery),
        fileTypes: extractFileTypes(lowerQuery),
        isFunctionSearch: isFunctionSearch(lowerQuery),
        isClassSearch: isClassSearch(lowerQuery),
        isAlgorithmSearch: isAlgorithmSearch(lowerQuery)
    };
    return analysis;
}
function extractMainIntent(query) {
    const lowerQuery = query.toLowerCase();
    // Better function detection
    if (lowerQuery.includes('function') ||
        lowerQuery.match(/where.*function/) ||
        lowerQuery.match(/find.*function/) ||
        lowerQuery.match(/show.*function/) ||
        lowerQuery.includes('func ') ||
        lowerQuery.match(/\w+\s+function/)) {
        return 'function';
    }
    // Better class detection
    if (lowerQuery.includes('class') ||
        lowerQuery.match(/where.*class/) ||
        lowerQuery.match(/find.*class/) ||
        lowerQuery.includes('interface') ||
        lowerQuery.includes('struct')) {
        return 'class';
    }
    // Algorithm-specific detection
    if (lowerQuery.includes('sort') ||
        lowerQuery.includes('algorithm') ||
        lowerQuery.includes('search') ||
        lowerQuery.includes('binary') ||
        lowerQuery.includes('bubble') ||
        lowerQuery.includes('quick') ||
        lowerQuery.includes('merge')) {
        return 'algorithm';
    }
    if (lowerQuery.includes('where is') || lowerQuery.includes('find') || lowerQuery.includes('locate')) {
        return 'location';
    }
    return 'general';
}
function isClassSearch(query) {
    return query.includes('class') ||
        query.match(/where.*class/) !== null ||
        query.match(/find.*class/) !== null ||
        query.includes('interface') ||
        query.includes('struct');
}
function isAlgorithmSearch(query) {
    return query.includes('algorithm') ||
        query.includes('sort') ||
        query.includes('search') ||
        query.includes('binary') ||
        query.includes('bubble') ||
        query.includes('quick') ||
        query.includes('merge') ||
        query.includes('filter');
}
function extractCodeConcepts(query) {
    const concepts = [];
    const codeKeywords = [
        // Sorting algorithms
        'bubble sort', 'quick sort', 'merge sort', 'heap sort', 'insertion sort', 'selection sort',
        'sorting algorithm', 'sort function', 'sort method',
        // Search algorithms  
        'binary search', 'linear search', 'search algorithm',
        // General
        'algorithm', 'data structure', 'function', 'class', 'method'
    ];
    codeKeywords.forEach(keyword => {
        if (query.toLowerCase().includes(keyword)) {
            concepts.push(keyword);
        }
    });
    return concepts;
}
function extractFileTypes(query) {
    const fileTypes = [];
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.cs'];
    extensions.forEach(ext => {
        if (query.includes(ext)) {
            fileTypes.push(ext);
        }
    });
    return fileTypes;
}
function isFunctionSearch(query) {
    return query.includes('function') ||
        query.match(/where.*function/) !== null ||
        query.match(/find.*function/) !== null;
}
//# sourceMappingURL=queryUnderstanding.js.map