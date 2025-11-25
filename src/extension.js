require('dotenv').config();
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN;
global.HF_TOKEN = HF_TOKEN;

console.log("HF token loaded:", HF_TOKEN ? "✅ Loaded" : "❌ Missing");

'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require('vscode'));
const http = require('http');
const path = __importStar(require('path'));
const fs = __importStar(require('fs'));

// Global storage for search index
let searchIndex = [];
let fileEmbeddings = new Map();

/**
 * Call local AI server for code generation
 */
async function callLocalAI(prompt) {
    return new Promise((resolve, reject) => {
        console.log('Sending request to local AI server...');
        console.log('Prompt preview:', (prompt || '').substring(0, 200).replace(/\n/g, ' '));

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
            timeout: 30000,
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => { 
                data += chunk; 
            });
            
            res.on('end', () => {
                try {
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        return reject(new Error(`AI server HTTP ${res.statusCode}: ${res.statusMessage || ''} - ${data}`));
                    }

                    const parsedData = JSON.parse(data || '{}');
                    console.log('AI server response received');

                    const generated = parsedData.generated_text ?? parsedData.generated_code ?? null;

                    if (typeof generated === 'string') {
                        let generatedCode = generated;
                        if (generatedCode.startsWith(prompt)) {
                            generatedCode = generatedCode.substring(prompt.length).trim();
                        }
                        return resolve(generatedCode);
                    }

                    if (parsedData.error) {
                        return reject(new Error(`AI Server Error: ${parsedData.error}`));
                    }

                    return reject(new Error(`Unexpected response format from AI server: ${JSON.stringify(parsedData)}`));
                } catch (parseError) {
                    return reject(new Error(`Error parsing AI response: ${String(parseError)}\nRaw response: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            return reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            return reject(new Error('Request timeout after 30 seconds. The AI server might be busy loading the model.'));
        });

        req.write(requestData);
        req.end();
    });
}

/**
 * Generate embeddings using the local Python AI server
 */
async function generateEmbedding(text) {
    return new Promise((resolve, reject) => {
        console.log('Generating embedding for text preview:', (text || '').substring(0, 120).replace(/\n/g, ' '));

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
            timeout: 30000,
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        return reject(new Error(`Embedding server HTTP ${res.statusCode}: ${res.statusMessage || ''} - ${data}`));
                    }

                    const parsedData = JSON.parse(data || '{}');
                    console.log('Embedding response received');

                    if (parsedData.embedding && Array.isArray(parsedData.embedding)) {
                        return resolve(parsedData.embedding);
                    }

                    if (parsedData.error) {
                        return reject(new Error(`Embedding Error: ${parsedData.error}`));
                    }

                    return reject(new Error(`Unexpected embedding response format: ${JSON.stringify(parsedData)}`));
                } catch (parseError) {
                    return reject(new Error(`Error parsing embedding response: ${String(parseError)}\nRaw response: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('Embedding request error:', error);
            return reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            return reject(new Error('Embedding request timeout after 30 seconds.'));
        });

        req.write(requestData);
        req.end();
    });
}

/**
 * Health check for the AI server
 */
async function checkAIHealth() {
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
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        return resolve(false);
                    }
                    const parsedData = JSON.parse(data || '{}');
                    const status = parsedData.status ?? '';
                    const modelLoaded = parsedData.model_loaded ?? parsedData.modelLoaded ?? false;
                    const healthy =
                      modelLoaded === true ||
                      status === 'healthy' ||
                      status === 'ok';
                    return resolve(Boolean(healthy));
                } catch {
                    return resolve(false);
                }
            });
        });

        req.on('error', () => {
            return resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            return resolve(false);
        });

        req.end();
    });
}

/**
 * Get programming language from file extension
 */
function getLanguageFromExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.cs': 'csharp',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.rs': 'rust',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.less': 'less',
        '.json': 'json',
        '.xml': 'xml',
        '.yml': 'yaml',
        '.yaml': 'yaml',
        '.md': 'markdown',
        '.sql': 'sql',
        '.sh': 'shell',
        '.ps1': 'powershell',
        '.bat': 'batch',
        '.r': 'r',
        '.m': 'matlab'
    };
    return languageMap[ext] || 'unknown';
}

/**
 * Build search index for the entire workspace
 */
async function buildSearchIndex() {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }

    const index = [];
    const excludedDirs = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode'];

    for (const folder of vscode.workspace.workspaceFolders) {
        const pattern = new vscode.RelativePattern(folder, '**/*.{js,ts,jsx,tsx,py,java,cpp,c,cs,php,rb,go,rs,swift,kt,scala,html,css,scss,less,json,xml,yml,yaml,md,sql,sh,ps1,bat,r,m}');
        const files = await vscode.workspace.findFiles(pattern, `**/{${excludedDirs.join(',')}}/**`);

        for (const file of files) {
            try {
                const content = await vscode.workspace.fs.readFile(file);
                const text = Buffer.from(content).toString('utf8');
                const language = getLanguageFromExtension(file.fsPath);
                
                // Only index files with substantial content
                if (text.trim().length > 50) {
                    index.push({
                        filePath: file.fsPath,
                        fileName: path.basename(file.fsPath),
                        language: language,
                        content: text.substring(0, 1000), // Limit content for embedding
                        fullContent: text
                    });
                }
            } catch (error) {
                console.error(`Error reading file ${file.fsPath}:`, error);
            }
        }
    }

    return index;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic search with language filtering
 */
async function semanticSearch(query, selectedLanguage = 'all', maxResults = 10) {
    if (searchIndex.length === 0) {
        searchIndex = await buildSearchIndex();
    }

    try {
        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);
        
        // Calculate similarities
        const results = [];
        
        for (const item of searchIndex) {
            // Filter by language if specified
            if (selectedLanguage !== 'all' && item.language !== selectedLanguage) {
                continue;
            }
            
            // Get or generate embedding for this file
            let itemEmbedding;
            if (fileEmbeddings.has(item.filePath)) {
                itemEmbedding = fileEmbeddings.get(item.filePath);
            } else {
                itemEmbedding = await generateEmbedding(item.content);
                fileEmbeddings.set(item.filePath, itemEmbedding);
            }
            
            const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
            
            if (similarity > 0.3) { // Threshold for relevant results
                results.push({
                    ...item,
                    similarity: similarity
                });
            }
        }
        
        // Sort by similarity and limit results
        return results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
            
    } catch (error) {
        console.error('Semantic search error:', error);
        // Fallback to simple text search
        return fallbackTextSearch(query, selectedLanguage, maxResults);
    }
}

/**
 * Fallback text-based search when embeddings fail
 */
function fallbackTextSearch(query, selectedLanguage = 'all', maxResults = 10) {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    
    const results = searchIndex
        .filter(item => selectedLanguage === 'all' || item.language === selectedLanguage)
        .map(item => {
            let score = 0;
            const content = item.content.toLowerCase();
            
            for (const term of queryTerms) {
                if (content.includes(term)) {
                    score += 1;
                }
                if (item.fileName.toLowerCase().includes(term)) {
                    score += 2;
                }
            }
            
            return { ...item, similarity: score / (queryTerms.length * 3) };
        })
        .filter(item => item.similarity > 0.1)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);
    
    return results;
}

/**
 * Escape HTML for webview content
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "<br>");
}

/**
 * Create webview HTML content for search results
 */
function getSearchResultsWebviewContent(results, query, selectedLanguage) {
    const resultsHtml = results.map(result => `
        <div class="search-result">
            <div class="result-header">
                <span class="file-name">${escapeHtml(result.fileName)}</span>
                <span class="language-badge">${escapeHtml(result.language)}</span>
                <span class="similarity">${(result.similarity * 100).toFixed(1)}% match</span>
            </div>
            <div class="file-path">${escapeHtml(result.filePath)}</div>
            <div class="code-preview">
                <pre><code>${escapeHtml(result.content.substring(0, 300))}...</code></pre>
            </div>
            <button class="open-file" data-file="${escapeHtml(result.filePath)}">Open File</button>
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Semantic Search Results</title>
            <style>
                body { 
                    padding: 20px; 
                    font-family: var(--vscode-font-family); 
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    line-height: 1.5;
                }
                .search-header {
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid var(--vscode-input-border);
                }
                .search-query {
                    font-size: 16px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .search-filters {
                    margin: 10px 0;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .search-result {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 15px;
                    border: 1px solid var(--vscode-input-border);
                }
                .result-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .file-name {
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .language-badge {
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 11px;
                }
                .similarity {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                }
                .file-path {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    margin-bottom: 10px;
                    font-family: monospace;
                }
                .code-preview {
                    background: var(--vscode-input-background);
                    padding: 10px;
                    border-radius: 3px;
                    margin-bottom: 10px;
                    max-height: 150px;
                    overflow: hidden;
                }
                .code-preview pre {
                    margin: 0;
                    white-space: pre-wrap;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 12px;
                }
                .open-file {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 5px 12px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .open-file:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .no-results {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="search-header">
                <div class="search-query">Search: "${escapeHtml(query)}"</div>
                <div class="search-filters">
                    Language: ${selectedLanguage === 'all' ? 'All Languages' : selectedLanguage} | 
                    Found ${results.length} result${results.length !== 1 ? 's' : ''}
                </div>
            </div>
            
            ${results.length > 0 ? resultsHtml : `
                <div class="no-results">
                    No results found for "${escapeHtml(query)}" in ${selectedLanguage === 'all' ? 'any language' : selectedLanguage}.<br>
                    Try a different query or check the language filter.
                </div>
            `}
            
            <script>
                const vscode = acquireVsCodeApi();
                document.querySelectorAll('.open-file').forEach(button => {
                    button.addEventListener('click', () => {
                        const filePath = button.getAttribute('data-file');
                        vscode.postMessage({
                            command: 'openFile',
                            filePath: filePath
                        });
                    });
                });
            </script>
        </body>
        </html>
    `;
}

function activate(context) {
    console.log('VS Code AI Extension is now active!');

    // Create output channel for AI responses
    const outputChannel = vscode.window.createOutputChannel('VS AI Assistant');
    context.subscriptions.push(outputChannel);

    // Semantic Search command
    const semanticSearchDisposable = vscode.commands.registerCommand(
        'vs-code-ai-extension.semanticSearch',
        async () => {
            // Get search query from user
            const query = await vscode.window.showInputBox({
                prompt: 'Enter your semantic search query',
                placeHolder: 'e.g., authentication middleware, database connection, error handling'
            });

            if (!query) return;

            // Let user select programming language
            const languages = [
                { label: 'All Languages', value: 'all' },
                { label: 'JavaScript', value: 'javascript' },
                { label: 'TypeScript', value: 'typescript' },
                { label: 'Python', value: 'python' },
                { label: 'Java', value: 'java' },
                { label: 'C++', value: 'cpp' },
                { label: 'C#', value: 'csharp' },
                { label: 'PHP', value: 'php' },
                { label: 'Ruby', value: 'ruby' },
                { label: 'Go', value: 'go' },
                { label: 'Rust', value: 'rust' },
                { label: 'Swift', value: 'swift' },
                { label: 'Kotlin', value: 'kotlin' },
                { label: 'HTML', value: 'html' },
                { label: 'CSS', value: 'css' },
                { label: 'SQL', value: 'sql' }
            ];

            const selectedLanguage = await vscode.window.showQuickPick(languages, {
                placeHolder: 'Select programming language to filter by (or All Languages)'
            });

            if (!selectedLanguage) return;

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `AI: Searching ${selectedLanguage.label}...`,
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });

                    // Build index if needed
                    if (searchIndex.length === 0) {
                        progress.report({ message: 'Building search index...' });
                        searchIndex = await buildSearchIndex();
                    }

                    progress.report({ message: 'Performing semantic search...' });
                    const results = await semanticSearch(query, selectedLanguage.value, 20);

                    progress.report({ increment: 100 });

                    // Create webview panel for results
                    const panel = vscode.window.createWebviewPanel(
                        'semanticSearch',
                        `Semantic Search: ${query}`,
                        vscode.ViewColumn.One,
                        { enableScripts: true }
                    );

                    panel.webview.html = getSearchResultsWebviewContent(results, query, selectedLanguage.value);

                    // Handle messages from webview
                    panel.webview.onDidReceiveMessage(
                        async message => {
                            if (message.command === 'openFile') {
                                try {
                                    const document = await vscode.workspace.openTextDocument(message.filePath);
                                    await vscode.window.showTextDocument(document);
                                } catch (error) {
                                    vscode.window.showErrorMessage(`Could not open file: ${message.filePath}`);
                                }
                            }
                        },
                        undefined,
                        context.subscriptions
                    );

                    // Log to output channel
                    outputChannel.appendLine(`=== Semantic Search ===`);
                    outputChannel.appendLine(`Query: "${query}"`);
                    outputChannel.appendLine(`Language: ${selectedLanguage.label}`);
                    outputChannel.appendLine(`Results: ${results.length} files found`);
                    results.forEach((result, index) => {
                        outputChannel.appendLine(`${index + 1}. ${result.filePath} (${result.language}, ${(result.similarity * 100).toFixed(1)}%)`);
                    });
                });

            } catch (error) {
                vscode.window.showErrorMessage(`Search failed: ${error.message}`);
                outputChannel.appendLine(`Search Error: ${error.message}`);
            }
        }
    );

    // ... (keep all your existing commands: testAI, explainCode, findBugs, chat, helloWorld)

    // Test AI connection command
    const testAIDisposable = vscode.commands.registerCommand(
        'vs-code-ai-extension.testAI',
        async () => {
            try {
                const isHealthy = await checkAIHealth();
                if (!isHealthy) {
                    vscode.window.showWarningMessage('AI server is not ready. Starting with limited functionality...');
                }

                vscode.window.showInformationMessage('Testing AI connection...');
                const response = await callLocalAI('Write a hello world function in TypeScript that returns a greeting message.');
                
                vscode.window.showInformationMessage(`AI Response received! Check output panel for details.`);
                
                outputChannel.show();
                outputChannel.appendLine('=== AI Test Response ===');
                outputChannel.appendLine(response);
                outputChannel.appendLine(''.padEnd(50, '='));
                
            } catch (error) {
                vscode.window.showErrorMessage(`AI Connection Failed: ${error.message}`);
                outputChannel.show();
                outputChannel.appendLine(`AI Error: ${error.message}`);
            }
        }
    );

    // Explain Code command
    const explainCodeDisposable = vscode.commands.registerCommand(
        'vs-code-ai-extension.explainCode',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found!');
                return;
            }

            const selection = editor.selection;
            const text = editor.document.getText(selection);
            
            if (!text) {
                vscode.window.showErrorMessage('Please select some code to explain!');
                return;
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "AI: Analyzing code...",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });
                    
                    const prompt = `Please explain this code in detail. Describe what it does, how it works, and any important concepts:\n\n${text}\n\nExplanation:`;
                    const explanation = await callLocalAI(prompt);
                    
                    progress.report({ increment: 100 });
                    
                    const panel = vscode.window.createWebviewPanel(
                        'codeExplanation',
                        'AI Code Explanation',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );
                    
                    panel.webview.html = getWebviewContent(explanation, text, 'Code Explanation');
                    
                    outputChannel.appendLine(`=== Code Explanation ===`);
                    outputChannel.appendLine(`Original code: ${text.substring(0, 100)}...`);
                    outputChannel.appendLine(`Explanation: ${explanation.substring(0, 200)}...`);
                });
                
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to explain code: ${error.message}`);
                outputChannel.appendLine(`Explain Code Error: ${error.message}`);
            }
        }
    );

    // Find Bugs command
    const findBugsDisposable = vscode.commands.registerCommand(
        'vs-code-ai-extension.findBugs',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found!');
                return;
            }

            const selection = editor.selection;
            const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
            
            if (!text) {
                vscode.window.showErrorMessage('Please select code or have an active file!');
                return;
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "AI: Looking for bugs...",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });
                    
                    const prompt = `Analyze this code for potential bugs, security issues, performance problems, or code smells. Be specific and suggest fixes:\n\n${text}\n\nAnalysis:`;
                    const analysis = await callLocalAI(prompt);
                    
                    progress.report({ increment: 100 });
                    
                    const panel = vscode.window.createWebviewPanel(
                        'codeAnalysis',
                        'AI Bug Analysis',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );
                    
                    panel.webview.html = getWebviewContent(analysis, text, 'Bug Analysis');
                    
                    outputChannel.appendLine(`=== Bug Analysis ===`);
                    outputChannel.appendLine(`Code analyzed: ${text.substring(0, 100)}...`);
                    outputChannel.appendLine(`Analysis: ${analysis.substring(0, 200)}...`);
                });
                
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to analyze code: ${error.message}`);
                outputChannel.appendLine(`Bug Analysis Error: ${error.message}`);
            }
        }
    );

    // Chat command - general AI chat
    const chatDisposable = vscode.commands.registerCommand(
        'vs-code-ai-extension.chat',
        async () => {
            const userInput = await vscode.window.showInputBox({
                prompt: 'Ask the AI anything about your code or programming in general',
                placeHolder: 'e.g., How do I optimize this function? What does this code do?'
            });

            if (!userInput) return;

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "AI: Thinking...",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });
                    
                    const response = await callLocalAI(userInput);
                    
                    progress.report({ increment: 100 });
                    
                    const panel = vscode.window.createWebviewPanel(
                        'aiChat',
                        'AI Chat Response',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );
                    
                    panel.webview.html = getWebviewContent(response, '', 'AI Chat Response');
                    
                    outputChannel.appendLine(`=== AI Chat ===`);
                    outputChannel.appendLine(`Question: ${userInput}`);
                    outputChannel.appendLine(`Response: ${response.substring(0, 300)}...`);
                });
                
            } catch (error) {
                vscode.window.showErrorMessage(`Chat failed: ${error.message}`);
                outputChannel.appendLine(`Chat Error: ${error.message}`);
            }
        }
    );

    // Original hello world command
    const helloWorldDisposable = vscode.commands.registerCommand(
        'vs-code-ai-extension.helloWorld',
        () => {
            const now = new Date().toLocaleString();
            vscode.window.showInformationMessage(
                `Hello World from VS Code AI Extension! Time: ${now}`
            );
        }
    );

    // Register all commands
    context.subscriptions.push(
        semanticSearchDisposable,
        testAIDisposable,
        explainCodeDisposable,
        findBugsDisposable,
        chatDisposable,
        helloWorldDisposable
    );

    // Show startup message with server status
    setTimeout(async () => {
        const isHealthy = await checkAIHealth();
        if (isHealthy) {
            vscode.window.showInformationMessage('VS AI Assistant is ready! 🚀 AI server connected.');
            
            // Pre-build search index in background
            buildSearchIndex().then(index => {
                searchIndex = index;
                console.log(`Search index built with ${index.length} files`);
            });
        } else {
            vscode.window.showWarningMessage('VS AI Assistant: AI server not detected. Some features may not work.');
        }
    }, 2000);
}

// Helper function for basic webview content (for other commands)
function getWebviewContent(content, originalCode = '', title = 'AI Response') {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                body { 
                    padding: 20px; 
                    font-family: var(--vscode-font-family); 
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    line-height: 1.5;
                }
                .response { 
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px; 
                    border-radius: 5px; 
                    white-space: pre-wrap;
                    border: 1px solid var(--vscode-input-border);
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                }
                .original-code {
                    background: var(--vscode-input-background);
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                    border-left: 4px solid var(--vscode-inputValidation-infoBorder);
                    font-family: monospace;
                    font-size: 12px;
                    white-space: pre-wrap;
                }
                h3 { 
                    color: var(--vscode-textLink-foreground); 
                    margin-top: 0;
                    margin-bottom: 15px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                .status {
                    padding: 4px 8px;
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    border-radius: 3px;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3>${title}</h3>
                <div class="status">AI Assistant</div>
            </div>
            ${originalCode ? `
                <div class="original-code">
                    <strong>Original Input:</strong><br><br>
                    ${escapeHtml(originalCode.substring(0, 1000))}
                    ${originalCode.length > 1000 ? '<br><br><em>... (truncated for display)</em>' : ''}
                </div>
            ` : ''}
            <div class="response">${escapeHtml(content)}</div>
        </body>
        </html>
    `;
}

function deactivate() {
    console.log('VS Code AI Extension is now deactivated!');
}

exports.activate = activate;
exports.deactivate = deactivate;