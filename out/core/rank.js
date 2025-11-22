"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankCandidates = rankCandidates;
function rankCandidates(snippets, query) {
    return snippets
        .map(snippet => ({
        ...snippet,
        relevance: calculateOverallRelevance(snippet, query)
    }))
        .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
function calculateOverallRelevance(snippet, query) {
    let score = snippet.relevance || 0;
    if (snippet.language === 'typescript' || snippet.language === 'javascript') {
        score *= 1.1;
    }
    if (snippet.filename.includes('test') || snippet.filename.includes('spec')) {
        score *= 0.7;
    }
    if (query && snippet.content.toLowerCase().includes(query.toLowerCase())) {
        score *= 1.2;
    }
    const contentLength = snippet.content.length;
    if (contentLength > 50 && contentLength < 500) {
        score *= 1.1;
    }
    return Math.min(1, Math.max(0, score));
}
//# sourceMappingURL=rank.js.map