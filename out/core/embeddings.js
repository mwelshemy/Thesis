"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
async function generateEmbedding(text) {
    try {
        return await generateDeepSeekEmbedding(text);
    }
    catch (error) {
        console.warn('DeepSeek embedding failed, using local fallback:', error);
        return generateLocalEmbedding(text);
    }
}
async function generateDeepSeekEmbedding(text) {
    try {
        const response = await fetch('http://localhost:8000/generate_embedding', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text.substring(0, 1000)
            })
        });
        if (!response.ok) {
            throw new Error(`Embedding API error: ${response.status}`);
        }
        const data = await response.json();
        if (!data.embedding || !Array.isArray(data.embedding)) {
            throw new Error('Invalid embedding response format');
        }
        return data.embedding;
    }
    catch (error) {
        console.warn('DeepSeek embedding API call failed:', error);
        throw error;
    }
}
function generateLocalEmbedding(text) {
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const embedding = new Array(128).fill(0);
    words.forEach(word => {
        const hash = simpleHash(word) % 128;
        embedding[hash] += 1;
    });
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
//# sourceMappingURL=embeddings.js.map