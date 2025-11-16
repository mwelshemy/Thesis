"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
async function testAI() {
    const testPrompts = [
        "function hello() { return 'world'; }",
        "const nums = [1,2,3]; const doubled = nums.map(n => n * 2);"
    ];
    for (const prompt of testPrompts) {
        try {
            const response = await (0, node_fetch_1.default)('http://localhost:8000/generate_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await response.json();
            console.log(`Prompt:\n${prompt}\nGenerated:\n${data.generated_code}\n---`);
        }
        catch (err) {
            console.error('Error querying backend:', err);
        }
    }
}
testAI();
//# sourceMappingURL=ai_prototype_run.js.map