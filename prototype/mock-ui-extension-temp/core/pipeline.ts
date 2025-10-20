import { retrieveCandidates } from "./retrieve";
import { rankCandidates } from "./rank";

/**
 * explaination for this part w kol el integration for the future 
 * runRetrievalPipeline()
 * Runs retrieval → ranking.
 * Later, the ranked[0] will be passed to callAI().
 */
export function runRetrievalPipeline(query: string) {
  const retrieved = retrieveCandidates(query);
  const ranked = rankCandidates(retrieved);

  console.log("Top candidates:");
  ranked.forEach((r, i) =>
    console.log(`${i + 1}. ${r.filename} (score: ${r.relevance})`)
  );

  //Nadia put your integration here
  console.log("\nNext step: send ranked[0].content to callAI(prompt)");

  //just a test
  runRetrievalPipeline("reverse string");

}
