"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbeddingsForProject = void 0;
exports.runRetrievalPipeline = runRetrievalPipeline;
exports.initializeEmbeddings = initializeEmbeddings;
const retrieve_1 = require("./retrieve");
const rank_1 = require("./rank");
var retrieve_2 = require("./retrieve");
Object.defineProperty(exports, "generateEmbeddingsForProject", { enumerable: true, get: function () { return retrieve_2.generateEmbeddingsForProject; } });
async function runRetrievalPipeline(query, maxResults = 5) {
    try {
        console.log(`🔍 Running semantic search for: "${query}"`);
        const retrieved = await (0, retrieve_1.retrieveCandidates)(query, maxResults * 2);
        if (retrieved.length === 0) {
            console.warn('No candidates retrieved');
            return [];
        }
        const ranked = (0, rank_1.rankCandidates)(retrieved, query);
        const topResults = ranked.slice(0, maxResults);
        console.log("✅ Top semantic matches:");
        topResults.forEach((r, i) => {
            console.log(`${i + 1}. ${r.filename} (line ${r.lineNumber}) - score: ${r.relevance?.toFixed(3)}`);
            console.log(`   Content: ${r.content.substring(0, 100)}...`);
        });
        return topResults;
    }
    catch (error) {
        console.error('Retrieval pipeline error:', error);
        return [];
    }
}
async function initializeEmbeddings() {
    console.log('🔄 Initializing code embeddings...');
    await (0, retrieve_1.generateEmbeddingsForProject)();
    console.log('✅ Embeddings system ready');
}
//# sourceMappingURL=pipeline.js.map