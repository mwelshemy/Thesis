"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetrievalPipeline = runRetrievalPipeline;
const retrieve_1 = require("./retrieve");
const rank_1 = require("./rank");
/**
 * explaination for this part w kol el integration for the future
 * runRetrievalPipeline()
 * Runs retrieval → ranking.
 * Later, the ranked[0] will be passed to callAI().
 */
function runRetrievalPipeline(query) {
    const retrieved = (0, retrieve_1.retrieveCandidates)(query);
    const ranked = (0, rank_1.rankCandidates)(retrieved);
    console.log("Top candidates:");
    ranked.forEach((r, i) => console.log(`${i + 1}. ${r.filename} (score: ${r.relevance})`));
    //Nadia put your integration here
    console.log("\nNext step: send ranked[0].content to callAI(prompt)");
    //just a test
    runRetrievalPipeline("reverse string");
}
