import { retrieveCandidates, generateEmbeddingsForProject, CodeSnippet } from "./retrieve";
import { rankCandidates } from "./rank";
import { analyzeQuery } from "./queryUnderstanding";

export { CodeSnippet };
export { generateEmbeddingsForProject } from "./retrieve";

/**
 * Complete retrieval pipeline for semantic code search
 */
export async function runRetrievalPipeline(query: string, maxResults: number = 5, minSimilarity: number = 0.15): Promise<CodeSnippet[]> {
  try {
    console.log(`Running semantic search for: "${query}" (min similarity: ${minSimilarity})`);
    
    // Analyze query for better understanding
    const queryAnalysis = analyzeQuery(query);
    console.log('Query analysis:', queryAnalysis);
    
    // Get more candidates for filtering
    const retrieved = await retrieveCandidates(query, maxResults * 5); // Get more candidates
    
    if (retrieved.length === 0) {
      console.warn('No candidates retrieved');
      return [];
    }
    
    const ranked = rankCandidates(retrieved, query);
    
    // Filter by similarity threshold - use dynamic threshold based on best score
    const bestScore = ranked[0]?.relevance || 0;
    const dynamicThreshold = Math.max(minSimilarity, bestScore * 0.3); // At least 30% of best score
    
    const filteredResults = ranked.filter(snippet => 
      (snippet.relevance || 0) >= dynamicThreshold
    ).slice(0, maxResults);

    console.log(`Results: ${filteredResults.length}/${ranked.length} passed ${(dynamicThreshold*100).toFixed(1)}% threshold (best: ${(bestScore*100).toFixed(1)}%)`);
    
    // Log similarity scores for debugging
    if (filteredResults.length > 0) {
      console.log('Top matches:');
      filteredResults.forEach((r, i) => {
        console.log(`${i + 1}. ${r.filename} - ${(r.relevance || 0).toFixed(3)} - ${r.filepath}`);
        if (i < 3) console.log(`   Code: ${r.content.substring(0, 100)}...`);
      });
    } else {
      console.log('No results passed threshold. All scores:');
      ranked.slice(0, 5).forEach((r, i) => {
        console.log(`${i + 1}. ${r.filename} - ${(r.relevance || 0).toFixed(3)}`);
      });
    }

    return filteredResults;
  } catch (error) {
    console.error('Retrieval pipeline error:', error);
    return [];
  }
}

/**
 * Initialize the embedding system
 */
export async function initializeEmbeddings(): Promise<void> {
  console.log('Initializing code embeddings...');
  await generateEmbeddingsForProject();
  console.log('Embeddings system ready');
}