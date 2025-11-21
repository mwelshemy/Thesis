import { retrieveCandidates, generateEmbeddingsForProject, CodeSnippet } from "./retrieve";
import { rankCandidates } from "./rank";

export { CodeSnippet };

/**
 * Complete retrieval pipeline for semantic code search
 */
export async function runRetrievalPipeline(query: string, maxResults: number = 5): Promise<CodeSnippet[]> {
  try {
    console.log(`🔍 Running semantic search for: "${query}"`);
    
    // Ensure embeddings are generated
    const retrieved = await retrieveCandidates(query, maxResults * 2);
    
    if (retrieved.length === 0) {
      console.warn('No candidates retrieved');
      return [];
    }
    
    const ranked = rankCandidates(retrieved, query);
    const topResults = ranked.slice(0, maxResults);

    console.log("✅ Top semantic matches:");
    topResults.forEach((r, i) => {
      console.log(`${i + 1}. ${r.filename} (line ${r.lineNumber}) - score: ${r.relevance?.toFixed(3)}`);
      console.log(`   Content: ${r.content.substring(0, 100)}...`);
    });

    return topResults;
  } catch (error) {
    console.error('Retrieval pipeline error:', error);
    return [];
  }
}

/**
 * Initialize the embedding system
 */
export async function initializeEmbeddings(): Promise<void> {
  console.log('🔄 Initializing code embeddings...');
  await generateEmbeddingsForProject();
  console.log('✅ Embeddings system ready');
}