"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callAI = callAI;
exports.callAIMock = callAIMock;
async function callAI(prompt) {
    try {
        const localApiUrl = 'http://localhost:8000/generate_code';
        console.log('Sending request to AI server...');
        const response = await fetch(localApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: prompt }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('AI server response received');
        if (data.generated_code) {
            if (data.generated_code.startsWith(prompt)) {
                return data.generated_code.substring(prompt.length).trim();
            }
            return data.generated_code;
        }
        console.warn('Unexpected response format from AI server:', data);
        return JSON.stringify(data, null, 2);
    }
    catch (error) {
        console.error('AI Call Error:', error);
        if (error.cause?.code === 'ECONNREFUSED') {
            return 'ERROR: Connection refused. Is your Python AI server (deepseek_api.py) running on http://localhost:8000?';
        }
        return `ERROR: ${error.message || 'Unknown error occurred'}`;
    }
}
async function callAIMock(prompt) {
    return `MOCK RESPONSE: This is a mock AI response for: "${prompt.substring(0, 100)}..."\n\nIn production, this would call the actual Hugging Face API.`;
}
//# sourceMappingURL=callAI.js.map