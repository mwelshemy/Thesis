"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.callAI = callAI;
exports.generateEmbedding = generateEmbedding;
exports.checkAIHealth = checkAIHealth;
exports.callAIMock = callAIMock;
exports.generateEmbeddingMock = generateEmbeddingMock;
async function callAI(prompt) {
    try {
        console.log('Sending request to AI server...');
        console.log('Prompt:', prompt.substring(0, 100) + '...');
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        return new Promise((resolve) => {
            const requestData = JSON.stringify({ prompt });
            const options = {
                hostname: 'localhost',
                port: 8000,
                path: '/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestData),
                },
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        console.log('AI server response received');
                        const generated = parsedData.generated_text ?? parsedData.generated_code ?? null;
                        if (typeof generated === 'string') {
                            let generatedCode = generated;
                            if (generatedCode.startsWith(prompt)) {
                                generatedCode = generatedCode.substring(prompt.length).trim();
                            }
                            resolve(generatedCode);
                        }
                        else if (parsedData.error) {
                            resolve(`AI Server Error: ${parsedData.error}`);
                        }
                        else {
                            console.warn('Unexpected response format from AI server:', parsedData);
                            resolve(JSON.stringify(parsedData, null, 2));
                        }
                    }
                    catch (parseError) {
                        resolve(`Error parsing AI response: ${parseError}\nRaw response: ${data}`);
                    }
                });
            });
            req.on('error', (error) => {
                console.error('Request error:', error);
                if (error.code === 'ECONNREFUSED') {
                    resolve('ERROR: Connection refused. Is your Python AI server (deepseek_api.py) running on http://localhost:8000? Run e.g.:\n' +
                        'python -m uvicorn deepseek_api:app --host 0.0.0.0 --port 8000 --reload');
                }
                else {
                    resolve(`ERROR: ${error.message || 'Unknown error occurred'}`);
                }
            });
            req.setTimeout(30000, () => {
                req.destroy();
                resolve('ERROR: Request timeout after 30 seconds. The AI server might be busy loading the model.');
            });
            req.write(requestData);
            req.end();
        });
    }
    catch (error) {
        console.error('AI Call Error:', error);
        return `ERROR: ${error.message || 'Unknown error occurred'}`;
    }
}
async function generateEmbedding(text) {
    try {
        console.log('Generating embedding for text:', text.substring(0, 50) + '...');
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        return new Promise((resolve) => {
            const requestData = JSON.stringify({ text });
            const options = {
                hostname: 'localhost',
                port: 8000,
                path: '/embed',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestData),
                },
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        console.log('Embedding response received');
                        if (parsedData.embedding && Array.isArray(parsedData.embedding)) {
                            resolve(parsedData.embedding);
                        }
                        else if (parsedData.error) {
                            resolve(`Embedding Error: ${parsedData.error}`);
                        }
                        else {
                            resolve(`Unexpected embedding response format: ${JSON.stringify(parsedData)}`);
                        }
                    }
                    catch (parseError) {
                        resolve(`Error parsing embedding response: ${parseError}`);
                    }
                });
            });
            req.on('error', (error) => {
                console.error('Embedding request error:', error);
                if (error.code === 'ECONNREFUSED') {
                    resolve('ERROR: Connection refused for embedding service.');
                }
                else {
                    resolve(`ERROR: ${error.message || 'Unknown error occurred'}`);
                }
            });
            req.setTimeout(30000, () => {
                req.destroy();
                resolve('ERROR: Embedding request timeout after 30 seconds.');
            });
            req.write(requestData);
            req.end();
        });
    }
    catch (error) {
        console.error('Embedding Call Error:', error);
        return `ERROR: ${error.message || 'Unknown error occurred'}`;
    }
}
async function checkAIHealth() {
    try {
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        return new Promise((resolve) => {
            const options = {
                hostname: 'localhost',
                port: 8000,
                path: '/health',
                method: 'GET',
                timeout: 5000,
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        const status = parsedData.status ?? '';
                        const modelLoaded = parsedData.model_loaded ?? parsedData.modelLoaded ?? false;
                        resolve(status === 'ok' ||
                            status === 'healthy' ||
                            status === 'mock_mode' ||
                            modelLoaded === true);
                    }
                    catch {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => {
                resolve(false);
            });
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        });
    }
    catch {
        return false;
    }
}
async function callAIMock(prompt) {
    return `MOCK RESPONSE: This is a mock AI response for: "${prompt.substring(0, 100)}..."\n\nIn production, this would call the actual Hugging Face API.`;
}
async function generateEmbeddingMock(text) {
    return Array(768).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);
}
//# sourceMappingURL=callAI.js.map