"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCosineSimilarity = calculateCosineSimilarity;
exports.findSimilarVectors = findSimilarVectors;
function calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error('Vectors must have same dimensions');
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
    return dotProduct / (magnitudeA * magnitudeB);
}
function findSimilarVectors(queryVector, vectors, k = 5) {
    const similarities = vectors.map((vector, index) => ({
        index,
        similarity: calculateCosineSimilarity(queryVector, vector)
    }));
    return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);
}
//# sourceMappingURL=similarity.js.map