"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankCandidates = rankCandidates;
/**
 * explaination for this part w kol el integration for the future

 * rankCandidates()
 * Sorts retrieved snippets by their computed relevance score.
 */
function rankCandidates(snippets) {
    return snippets.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
