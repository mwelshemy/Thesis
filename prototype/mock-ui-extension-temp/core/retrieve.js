"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieve = retrieve;
// core/retrieve.ts
function retrieve(query) {
    console.log("Retrieving mock data for query:", query);
    // Simulated mock dataset
    const dataset = [
        { id: 1, code: "function add(a, b) { return a + b; }", tags: ["math", "addition"] },
        { id: 2, code: "function sort(arr) { return arr.sort(); }", tags: ["array", "sorting"] },
        { id: 3, code: "function multiply(a, b) { return a * b; }", tags: ["math", "multiplication"] }
    ];
    // Very basic keyword matching
    const results = dataset.filter(item => item.code.toLowerCase().includes(query.toLowerCase()) ||
        item.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())));
    return results;
}
