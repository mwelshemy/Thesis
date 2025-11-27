/**
 * Cosine similarity calculation for vector comparison
 */

export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    console.warn(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}. Truncating/padding to match.`);
    
    // Handle dimension mismatch by using the smaller dimension
    const minLength = Math.min(vecA.length, vecB.length);
    const truncatedA = vecA.slice(0, minLength);
    const truncatedB = vecB.slice(0, minLength);
    
    vecA = truncatedA;
    vecB = truncatedB;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);
  return similarity;
}

/**
 * Find top-k most similar vectors
 */
export function findSimilarVectors(
  queryVector: number[], 
  vectors: number[][], 
  k: number = 5
): { index: number; similarity: number }[] {
  const similarities = vectors.map((vector, index) => ({
    index,
    similarity: calculateCosineSimilarity(queryVector, vector)
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}