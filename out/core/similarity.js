"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCosineSimilarity = calculateCosineSimilarity;
function calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        const minLength = Math.min(vecA.length, vecB.length);
        vecA = vecA.slice(0, minLength);
        vecB = vecB.slice(0, minLength);
    }
    let dotProduct = 0, magnitudeA = 0, magnitudeB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0)
        return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}
//# sourceMappingURL=similarity.js.map