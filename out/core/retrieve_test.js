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
exports.generateEmbeddingsForProject = generateEmbeddingsForProject;
exports.retrieveCandidates = retrieveCandidates;
exports.retrieve = retrieve;
const vscode = __importStar(require("vscode"));
const embeddings_1 = require("./embeddings");
const similarity_1 = require("./similarity");
let vectorStore = [];
async function generateEmbeddingsForProject() {
    try {
        if (!vscode.workspace.workspaceFolders) {
            console.warn('No workspace folder open.');
            return [];
        }
        const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,php,rb,go,rs}', '**/node_modules/**');
        vectorStore = [];
        let processed = 0;
        for (const file of files.slice(0, 200)) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const content = document.getText();
                if (content.length < 10 || content.length > 10000)
                    continue;
                const chunks = splitCodeIntoChunks(content, document.languageId);
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const embedding = await (0, embeddings_1.generateEmbedding)(chunk.content);
                    const snippet = {
                        filename: `${file.fsPath.split('/').pop()}#${i + 1}`,
                        filepath: file.fsPath,
                        content: chunk.content,
                        language: document.languageId,
                        lineNumber: chunk.startLine,
                        embedding: embedding
                    };
                    vectorStore.push(snippet);
                }
                processed++;
                if (processed % 10 === 0) {
                    console.log(`Generated embeddings for ${processed} files...`);
                }
            }
            catch (error) {
                console.warn(`Failed to process ${file.fsPath}:`, error);
            }
        }
        console.log(`✅ Generated ${vectorStore.length} code snippet embeddings`);
        return vectorStore;
    }
    catch (error) {
        console.error('Error generating embeddings:', error);
        return [];
    }
}
async function retrieveCandidates(query, maxResults = 10) {
    if (vectorStore.length === 0) {
        console.warn('Vector store is empty. Generating embeddings first...');
        await generateEmbeddingsForProject();
    }
    const queryEmbedding = await (0, embeddings_1.generateEmbedding)(query);
    const scoredSnippets = [];
    for (const snippet of vectorStore) {
        if (snippet.embedding) {
            const similarity = (0, similarity_1.calculateCosineSimilarity)(queryEmbedding, snippet.embedding);
            scoredSnippets.push({
                ...snippet,
                relevance: similarity
            });
        }
    }
    return scoredSnippets
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, maxResults);
}
async function retrieve(query, maxResults = 10) {
    return retrieveCandidates(query, maxResults);
}
function splitCodeIntoChunks(content, language) {
    const chunks = [];
    const lines = content.split('\n');
    let currentChunk = [];
    let chunkStartLine = 1;
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (isCodeBlockStart(trimmed, language) && !inBlock) {
            if (currentChunk.length > 0) {
                chunks.push({
                    content: currentChunk.join('\n'),
                    startLine: chunkStartLine
                });
            }
            currentChunk = [line];
            chunkStartLine = i + 1;
            inBlock = true;
        }
        else if (isCodeBlockEnd(trimmed, language) && inBlock) {
            currentChunk.push(line);
            chunks.push({
                content: currentChunk.join('\n'),
                startLine: chunkStartLine
            });
            currentChunk = [];
            inBlock = false;
        }
        else if (inBlock || currentChunk.length === 0) {
            currentChunk.push(line);
        }
        if (currentChunk.length >= 20 && !inBlock) {
            chunks.push({
                content: currentChunk.join('\n'),
                startLine: chunkStartLine
            });
            currentChunk = [];
            chunkStartLine = i + 1;
        }
    }
    if (currentChunk.length > 0) {
        chunks.push({
            content: currentChunk.join('\n'),
            startLine: chunkStartLine
        });
    }
    return chunks;
}
function isCodeBlockStart(line, language) {
    const patterns = {
        typescript: /^(export\s+)?(class|function|interface|type|const|let|var)\s+\w/,
        javascript: /^(export\s+)?(class|function|const|let|var)\s+\w/,
        python: /^(class|def)\s+\w/,
        java: /^(public|private|protected)?\s*(class|interface|void)\s+\w/,
    };
    return patterns[language]?.test(line) || false;
}
function isCodeBlockEnd(line, language) {
    return line === '}' || line.startsWith('}') ||
        (language === 'python' && line.trim() === '') ||
        line.includes('});') || line.includes('};');
}
//# sourceMappingURL=retrieve_test.js.map