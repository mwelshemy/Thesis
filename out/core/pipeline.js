"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbeddingsForProject = void 0;
exports.runRetrievalPipeline = runRetrievalPipeline;
exports.initializeEmbeddings = initializeEmbeddings;
const retrieve_1 = require("./retrieve");
const rank_1 = require("./rank");
const queryUnderstanding_1 = require("./queryUnderstanding");
var retrieve_2 = require("./retrieve");
Object.defineProperty(exports, "generateEmbeddingsForProject", { enumerable: true, get: function () { return retrieve_2.generateEmbeddingsForProject; } });
/**
 * Complete retrieval pipeline for semantic code search
 */
async function runRetrievalPipeline(query, maxResults = 5, minSimilarity = 0.15) {
    try {
        console.log(`Running semantic search for: "${query}" (min similarity: ${minSimilarity})`);
        // Analyze query for better understanding
        const queryAnalysis = (0, queryUnderstanding_1.analyzeQuery)(query);
        console.log('Query analysis:', queryAnalysis);
        // Get more candidates for filtering
        const retrieved = await (0, retrieve_1.retrieveCandidates)(query, maxResults * 5); // Get more candidates
        if (retrieved.length === 0) {
            console.warn('No candidates retrieved');
            return [];
        }
        const ranked = (0, rank_1.rankCandidates)(retrieved, query);
        // Filter by similarity threshold - use dynamic threshold based on best score
        const bestScore = ranked[0]?.relevance || 0;
        const dynamicThreshold = Math.max(minSimilarity, bestScore * 0.3); // At least 30% of best score
        const filteredResults = ranked.filter(snippet => (snippet.relevance || 0) >= dynamicThreshold).slice(0, maxResults);
        console.log(`Results: ${filteredResults.length}/${ranked.length} passed ${(dynamicThreshold * 100).toFixed(1)}% threshold (best: ${(bestScore * 100).toFixed(1)}%)`);
        // Log similarity scores for debugging
        if (filteredResults.length > 0) {
            console.log('Top matches:');
            filteredResults.forEach((r, i) => {
                console.log(`${i + 1}. ${r.filename} - ${(r.relevance || 0).toFixed(3)} - ${r.filepath}`);
                if (i < 3)
                    console.log(`   Code: ${r.content.substring(0, 100)}...`);
            });
        }
        else {
            console.log('No results passed threshold. All scores:');
            ranked.slice(0, 5).forEach((r, i) => {
                console.log(`${i + 1}. ${r.filename} - ${(r.relevance || 0).toFixed(3)}`);
            });
        }
        return filteredResults;
    }
    catch (error) {
        console.error('Retrieval pipeline error:', error);
        return [];
    }
}
/**
 * Initialize the embedding system
 */
async function initializeEmbeddings() {
    console.log('Initializing code embeddings...');
    await (0, retrieve_1.generateEmbeddingsForProject)();
    console.log('Embeddings system ready');
}
//# sourceMappingURL=pipeline.js.map