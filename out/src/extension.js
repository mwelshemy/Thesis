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
exports.handleAnalyzeEntireProjectCommand = handleAnalyzeEntireProjectCommand;
exports.handleFindBugsInProjectCommand = handleFindBugsInProjectCommand;
exports.handleGenerateProjectSummaryCommand = handleGenerateProjectSummaryCommand;
exports.handleSemanticSearchCommand = handleSemanticSearchCommand;
exports.handleSearchProjectCommand = handleSearchProjectCommand;
exports.handleRAGDiagnosticsCommand = handleRAGDiagnosticsCommand;
exports.handleRebuildRAGIndexCommand = handleRebuildRAGIndexCommand;
exports.handleTestRAGCommand = handleTestRAGCommand;
exports.handleChatCommand = handleChatCommand;
exports.handleExplainCodeCommand = handleExplainCodeCommand;
exports.handleSummarizeFileCommand = handleSummarizeFileCommand;
exports.handleFindBugsCommand = handleFindBugsCommand;
exports.handleSuggestImprovementsCommand = handleSuggestImprovementsCommand;
exports.handleCodeUnderstandingSearchCommand = handleCodeUnderstandingSearchCommand;
exports.handleSemanticFunctionSearchCommand = handleSemanticFunctionSearchCommand;
exports.handleAskAICommand = handleAskAICommand;
exports.handleSmartExplainCommand = handleSmartExplainCommand;
exports.handleDeepAnalysisCommand = handleDeepAnalysisCommand;
exports.handlePatternAnalysisCommand = handlePatternAnalysisCommand;
exports.handleAnalyzeSearchResultsCommand = handleAnalyzeSearchResultsCommand;
exports.debugSimilarityScores = debugSimilarityScores;
exports.handleBuildSearchIndexCommand = handleBuildSearchIndexCommand;
exports.handleSearchStatsCommand = handleSearchStatsCommand;
exports.handleSearchByLanguageCommand = handleSearchByLanguageCommand;
exports.handleClearSearchIndexCommand = handleClearSearchIndexCommand;
exports.handleQuickFileSearchCommand = handleQuickFileSearchCommand;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const callAI_1 = require("./ai/callAI");
const sidebar_view_provider_1 = require("./webviews/sidebar-view-provider");
const refactor_manager_1 = require("./refactoring/refactor-manager");
const pipeline_1 = require("../core/pipeline");
const embeddings_1 = require("../core/embeddings");
const retrieve_1 = require("../core/retrieve");
const fastBugScan_1 = require("./fastBugScan");
const search_1 = require("./search");
let sidebarProvider;
/** Utilities */
async function runWithProgress(title, task) {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
    }, (progress) => task(progress));
}
function postToSidebar(title, content, action) {
    if (sidebarProvider) {
        sidebarProvider.showAIAnalysis(title, content, action);
    }
}
/** Utility functions for file access */
async function getAllProjectFiles() {
    try {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage('No workspace folder open.');
            return [];
        }
        const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        return files;
    }
    catch (err) {
        console.error('Error getting project files:', err);
        vscode.window.showErrorMessage('Error accessing project files.');
        return [];
    }
}
async function analyzeFileForBugs(filename, content, language) {
    try {
        const prompt = `Analyze this ${language} file for bugs and issues:

File: ${filename}
Content:
\`\`\`${language}
${content.substring(0, 2000)}
\`\`\`

Provide a concise bug report focusing on critical issues only. If no significant issues found, return "No critical issues found."`;
        const response = await (0, callAI_1.callAI)(prompt);
        if (response && !response.includes('No critical issues') && !response.includes('no significant issues')) {
            return `## ${filename}\n\n${response}`;
        }
        return null;
    }
    catch (err) {
        console.warn(`Failed to analyze ${filename} for bugs:`, err);
        return null;
    }
}
function getLanguageFromExtension(ext) {
    const map = {
        'js': 'JavaScript',
        'ts': 'TypeScript',
        'jsx': 'React JSX',
        'tsx': 'React TSX',
        'py': 'Python',
        'java': 'Java',
        'cpp': 'C++',
        'c': 'C',
        'cs': 'C#',
        'php': 'PHP',
        'rb': 'Ruby',
        'go': 'Go',
        'rs': 'Rust',
        'html': 'HTML',
        'css': 'CSS',
        'json': 'JSON',
        'md': 'Markdown',
        'xml': 'XML',
        'yml': 'YAML',
        'yaml': 'YAML'
    };
    return map[ext] || ext;
}
/** Enhanced command handlers that work with entire codebase */
async function handleAnalyzeEntireProjectCommand() {
    try {
        await runWithProgress('Analyzing entire project...', async (progress) => {
            progress.report({ message: 'Scanning project files...' });
            // Get all files in workspace
            const files = await getAllProjectFiles();
            if (files.length === 0) {
                postToSidebar('Project Analysis', 'No files found in workspace.', 'analyzeProject');
                return;
            }
            progress.report({ message: `Found ${files.length} files, analyzing key files...` });
            // Read and concatenate file contents
            let combinedContent = '';
            let filesProcessed = 0;
            // Prioritize important files first
            const importantFiles = files.filter(file => {
                const name = file.fsPath.toLowerCase();
                return !name.includes('node_modules') &&
                    !name.includes('dist') &&
                    !name.includes('build') &&
                    !name.includes('.git');
            }).sort((a, b) => {
                // Prioritize source files over config files
                const aIsConfig = a.fsPath.includes('config') || a.fsPath.includes('package.json');
                const bIsConfig = b.fsPath.includes('config') || b.fsPath.includes('package.json');
                return aIsConfig === bIsConfig ? 0 : aIsConfig ? 1 : -1;
            });
            for (const file of importantFiles.slice(0, 30)) { // Limit to avoid token limits
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const content = doc.getText();
                    if (content.trim().length > 10) { // Only include non-empty files
                        combinedContent += `\n\n// File: ${file.fsPath.split(/[\\/]/).pop()}\n// Path: ${file.fsPath}\n\`\`\`${doc.languageId}\n${content.substring(0, 500)}\n\`\`\``;
                        filesProcessed++;
                    }
                }
                catch (err) {
                    console.warn(`Could not read file: ${file.fsPath}`, err);
                }
            }
            if (!combinedContent.trim()) {
                postToSidebar('Project Analysis', 'Could not read any files for analysis.', 'analyzeProject');
                return;
            }
            progress.report({ message: `Analyzed ${filesProcessed} files, generating report...` });
            const prompt = `Analyze this entire project structure and code:

${combinedContent.substring(0, 12000)}

Please provide a comprehensive analysis covering:
1. Overall project structure and architecture
2. Main technologies and frameworks used
3. Key modules and their responsibilities
4. Code quality assessment
5. Potential issues or improvements
6. Dependencies and relationships between files
7. Build configuration and setup

Project Analysis:`;
            const response = await (0, callAI_1.callAI)(prompt);
            const fullAnalysis = `## Complete Project Analysis\n\n**Files Scanned:** ${filesProcessed} of ${files.length} total files\n\n${response}`;
            postToSidebar('Complete Project Analysis', fullAnalysis, 'analyzeProject');
        });
    }
    catch (err) {
        postToSidebar('Project Analysis Error', 'Failed to analyze project: ' + String(err), 'analyzeProject');
        console.error(err);
    }
}
async function handleFindBugsInProjectCommand() {
    try {
        await runWithProgress('Scanning project for bugs (fast mode)...', async (progress) => {
            progress.report({ message: 'Collecting project files and running fast scan...' });
            const result = await (0, fastBugScan_1.fastFindBugsInProject)({
                maxFiles: 80,
                batchSize: 6,
                concurrency: 2,
                includeStaticChecks: true,
                aiInstructions: 'Focus on critical runtime bugs and security vulnerabilities. Return only concise issues.'
            });
            if (result.warnings && result.warnings.length) {
                console.warn('Fast bug scan warnings:', result.warnings);
            }
            const reports = result.reports || [];
            if (!reports || reports.length === 0) {
                postToSidebar('Project Bug Scan', 'No issues found by fast scan.', 'findBugsInProject');
                return;
            }
            // Format an aggregated report (concise)
            const lines = [];
            let totalIssues = 0;
            for (const r of reports) {
                if (!r.issues || r.issues.length === 0)
                    continue;
                totalIssues += r.issues.length;
                lines.push(`### ${r.fileName}`);
                r.issues.slice(0, 20).forEach((issue, i) => {
                    const prefix = issue.severity ? `[${issue.severity}] ` : '';
                    const loc = issue.location ? ` (${issue.location})` : '';
                    lines.push(`- ${prefix}${issue.message}${loc}${issue.suggestion ? ` — Suggestion: ${issue.suggestion}` : ''}`);
                });
                if (r.raw) {
                    lines.push(`\n\`\`\`\n${r.raw.substring(0, 1000)}\n\`\`\`\n`);
                }
                lines.push('---');
            }
            if (totalIssues === 0) {
                postToSidebar('Project Bug Scan', 'No significant issues found by fast scan.', 'findBugsInProject');
                return;
            }
            const combined = `## Project Bug Scan (fast)\n\nFiles scanned: ${reports.length}\nTotal issues found: ${totalIssues}\n\n` + lines.join('\n');
            postToSidebar('Project Bug Report', combined, 'findBugsInProject');
        });
    }
    catch (err) {
        postToSidebar('Bug Scan Error', 'Failed to run fast bug scan: ' + String(err), 'findBugsInProject');
        console.error(err);
    }
}
async function handleGenerateProjectSummaryCommand() {
    try {
        await runWithProgress('Generating project summary...', async (progress) => {
            progress.report({ message: 'Analyzing project structure...' });
            const files = await getAllProjectFiles();
            if (files.length === 0) {
                postToSidebar('Project Summary', 'No files found in workspace.', 'generateProjectSummary');
                return;
            }
            const fileStats = {
                total: files.length,
                byLanguage: {},
                byExtension: {}
            };
            // Collect file statistics
            files.forEach(file => {
                const ext = file.fsPath.split('.').pop() || 'none';
                const lang = getLanguageFromExtension(ext);
                fileStats.byExtension[ext] = (fileStats.byExtension[ext] || 0) + 1;
                fileStats.byLanguage[lang] = (fileStats.byLanguage[lang] || 0) + 1;
            });
            // Sample key files for analysis
            const keyFiles = files.filter(file => {
                const name = file.fsPath.toLowerCase();
                return name.includes('package.json') ||
                    name.includes('readme') ||
                    name.includes('index.') ||
                    name.includes('app.') ||
                    name.includes('main.') ||
                    name.includes('server.') ||
                    name.includes('client.') ||
                    name.includes('manifest.json') ||
                    name.includes('dockerfile') ||
                    name.includes('.config.') ||
                    !name.includes('test');
            }).slice(0, 15);
            let sampleContent = '';
            let filesRead = 0;
            for (const file of keyFiles) {
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const content = doc.getText();
                    if (content.trim().length > 10) {
                        sampleContent += `\n\n// File: ${file.fsPath.split(/[\\/]/).pop()}\n\`\`\`${doc.languageId}\n${content.substring(0, 800)}\n\`\`\``;
                        filesRead++;
                    }
                }
                catch (err) {
                    // Skip files that can't be read
                }
            }
            progress.report({ message: 'Generating comprehensive summary...' });
            const prompt = `Based on this project structure and sample files, provide a comprehensive summary:

File Statistics:
- Total files: ${fileStats.total}
- By language: ${JSON.stringify(fileStats.byLanguage)}
- By extension: ${JSON.stringify(fileStats.byExtension)}

Sample Files Content:
${sampleContent.substring(0, 10000)}

Please provide:
1. Project type and main technology stack
2. Overall architecture and structure
3. Key components and their purposes
4. Development patterns and conventions used
5. Estimated complexity and scale
6. Recommendations for organization or improvements
7. Dependencies and build process insights

Project Summary:`;
            const response = await (0, callAI_1.callAI)(prompt);
            const fullReport = `## Project Overview\n\n**File Statistics:**\n- Total Files: ${fileStats.total}\n- Languages: ${JSON.stringify(fileStats.byLanguage)}\n- Extensions: ${JSON.stringify(fileStats.byExtension)}\n- Key Files Analyzed: ${filesRead}\n\n${response}`;
            postToSidebar('Project Summary', fullReport, 'generateProjectSummary');
        });
    }
    catch (err) {
        postToSidebar('Summary Error', 'Failed to generate project summary: ' + String(err), 'generateProjectSummary');
        console.error(err);
    }
}
/** Pure RAG Search Commands */
async function handleSemanticSearchCommand(payload) {
    try {
        const query = payload?.query;
        if (!query?.trim()) {
            postToSidebar('Semantic Search', 'Please enter a search query.', 'semanticSearch');
            return;
        }
        await runWithProgress('Searching with RAG...', async (progress) => {
            progress.report({ message: 'Using pure semantic search...' });
            // Use 10% similarity threshold for better recall during testing
            const results = await (0, pipeline_1.runRetrievalPipeline)(query, 15, 0.1);
            console.log(`RAG Search for "${query}": ${results.length} results`);
            if (results.length === 0) {
                postToSidebar('Semantic Search', `No matches found for "${query}" (minimum 10% similarity)\n\nTry:\n• Using more specific terms\n• Describing the code purpose\n• Checking if embeddings were generated\n• Using function/class names directly`, 'semanticSearch');
                return;
            }
            const formattedResults = {
                type: 'semanticSearchResults',
                title: 'Semantic Search Results',
                summary: `Found ${results.length} matches with ≥10% similarity for: "${query}"`,
                query: query,
                results: results.map((result, index) => ({
                    fileName: result.filename,
                    filePath: result.filepath,
                    language: result.language,
                    lineNumber: result.lineNumber,
                    confidence: `${Math.round((result.relevance || 0) * 100)}%`,
                    similarity: result.relevance?.toFixed(3),
                    codeSnippet: result.content,
                    preview: result.content.substring(0, 150) + '...'
                }))
            };
            postToSidebar('Semantic Search Results', formattedResults, 'semanticSearch');
        });
    }
    catch (err) {
        console.error(`RAG Search failed:`, err);
        postToSidebar('Semantic Search Error', 'RAG search failed: ' + String(err), 'semanticSearch');
    }
}
async function handleSearchProjectCommand(payload) {
    try {
        const q = (payload?.query || '').trim();
        if (!q) {
            postToSidebar('Search Results', 'Please enter a search query.', 'searchProject');
            return;
        }
        console.log(`Full-text Project Search: "${q}"`);
        // 1) Run full-text substring search (works like Ctrl+F across files)
        const textResults = await (0, search_1.fullTextSearch)(q, 200, true);
        console.log(`Full-text search found ${textResults.length} results for "${q}"`);
        if (textResults && textResults.length > 0) {
            const formattedResults = {
                type: 'fileList',
                title: 'Text Search Results',
                summary: `Found ${textResults.length} files containing "${q}"`,
                files: textResults.map(r => ({
                    fileName: r.fileName,
                    filePath: r.filePath,
                    language: r.language,
                    lineCount: r.lineCount || 0
                }))
            };
            // Post so the sidebar renders into the text-search-results section
            postToSidebar('Search Results', formattedResults, 'searchProject');
            return;
        }
        // 2) If no plain text matches, optionally fall back to semantic search (RAG)
        try {
            const results = await (0, pipeline_1.runRetrievalPipeline)(q, 10, 0.1);
            console.log(`RAG fallback search found ${results.length} results for "${q}"`);
            if (!results || results.length === 0) {
                postToSidebar('Search Results', `No matches found for "${q}" using text search and semantic fallback.\n\nTry:\n• Using different keywords\n• Searching by function/class names\n• Building the index (Build Index)`, 'searchProject');
                return;
            }
            const formattedResults = {
                type: 'semanticSearchResults',
                title: 'Semantic Search Results',
                summary: `Found ${results.length} matches for "${q}" (semantic fallback)`,
                query: q,
                results: results.map((result) => ({
                    fileName: result.filename,
                    filePath: result.filepath,
                    language: result.language,
                    lineNumber: result.lineNumber,
                    confidence: `${Math.round((result.relevance || 0) * 100)}%`,
                    similarity: result.relevance?.toFixed(3),
                    codeSnippet: result.content,
                    preview: result.content?.substring(0, 150) + '...'
                }))
            };
            postToSidebar('Search Results', formattedResults, 'searchProject');
        }
        catch (ragErr) {
            console.error('Semantic fallback failed:', ragErr);
            postToSidebar('Search Error', 'Search failed: ' + String(ragErr), 'searchProject');
        }
    }
    catch (err) {
        console.error(`Search Project failed for "${payload?.query}":`, err);
        postToSidebar('Search Error', 'Search failed: ' + String(err), 'searchProject');
    }
}
/** RAG Diagnostic Commands */
async function handleRAGDiagnosticsCommand() {
    try {
        await runWithProgress('Checking RAG system...', async (progress) => {
            progress.report({ message: 'Validating vector store...' });
            const stats = await (0, retrieve_1.getVectorStoreStats)();
            const validation = await (0, retrieve_1.validateVectorStore)();
            const diagnostic = {
                timestamp: new Date().toISOString(),
                vectorStore: stats,
                validation: validation,
                workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'No workspace',
                similarityThreshold: '10% (0.1)'
            };
            console.log('RAG Diagnostics:', diagnostic);
            postToSidebar('RAG Diagnostics', diagnostic, 'ragDiagnostics');
        });
    }
    catch (err) {
        console.error('RAG Diagnostics failed:', err);
        postToSidebar('Diagnostic Error', 'Failed to check RAG system: ' + String(err), 'ragDiagnostics');
    }
}
async function handleRebuildRAGIndexCommand() {
    try {
        await runWithProgress('Rebuilding RAG index...', async (progress) => {
            progress.report({ message: 'Clearing existing embeddings...' });
            await (0, retrieve_1.clearAllEmbeddings)();
            progress.report({ message: 'Generating new embeddings...' });
            await (0, pipeline_1.initializeEmbeddings)();
            const stats = await (0, retrieve_1.getVectorStoreStats)();
            console.log('RAG Index Rebuilt:', stats);
            postToSidebar('RAG Index Rebuilt', {
                message: 'RAG index has been successfully rebuilt with 10% similarity threshold',
                stats: stats,
                similarityThreshold: '10%'
            }, 'rebuildRAGIndex');
        });
    }
    catch (err) {
        console.error('RAG Rebuild failed:', err);
        postToSidebar('Rebuild Error', 'Failed to rebuild RAG index: ' + String(err), 'rebuildRAGIndex');
    }
}
/** Test RAG Command */
async function handleTestRAGCommand(payload) {
    try {
        const testQuery = payload?.query || 'test query for sorting function';
        console.log('Testing RAG system with query:', testQuery);
        const results = await (0, pipeline_1.runRetrievalPipeline)(testQuery, 5, 0.1);
        const testResult = {
            query: testQuery,
            resultsCount: results.length,
            similarityThreshold: '10%',
            results: results.map(r => ({
                file: r.filename,
                similarity: r.relevance?.toFixed(3),
                confidence: `${Math.round((r.relevance || 0) * 100)}%`,
                preview: r.content.substring(0, 100)
            })),
            ragWorking: results.length > 0
        };
        console.log(' RAG Test Result:', testResult);
        postToSidebar('RAG Test', testResult, 'testRAG');
    }
    catch (err) {
        console.error(' RAG Test failed:', err);
        postToSidebar('RAG Test Failed', 'RAG test failed: ' + String(err), 'testRAG');
    }
}
/** AI Chat with RAG */
async function handleChatCommand(payload) {
    try {
        const userMessage = payload?.message;
        if (!userMessage?.trim()) {
            postToSidebar('Chat', 'Please enter a message.', 'chat');
            return;
        }
        await runWithProgress('AI is thinking...', async (progress) => {
            progress.report({ message: 'Processing your question...' });
            // Use RAG to find relevant context for code questions with 10% threshold
            let context = '';
            if (isCodeRelatedQuery(userMessage)) {
                progress.report({ message: 'Searching for relevant code with RAG...' });
                try {
                    const relevantCode = await (0, pipeline_1.runRetrievalPipeline)(userMessage, 3, 0.1);
                    if (relevantCode.length > 0) {
                        context = '\n\nRelevant code from your project found via RAG:\n' +
                            relevantCode.map(snippet => `File: ${snippet.filename} (similarity: ${(snippet.relevance || 0).toFixed(3)})\n` +
                                `Code:\n\`\`\`${snippet.language}\n${snippet.content}\n\`\`\`\n`).join('\n');
                        console.log(` RAG Chat found ${relevantCode.length} context snippets for: "${userMessage}"`);
                    }
                }
                catch (ragError) {
                    console.warn('RAG context search failed for chat:', ragError);
                }
            }
            const prompt = `You are a helpful AI coding assistant with access to the user's codebase via RAG.

User question: "${userMessage}"${context}

Please provide a helpful, concise response. If code context was found, reference it specifically.

Response:`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar('Chat Response', response, 'chat');
        });
    }
    catch (err) {
        console.error(' Chat failed:', err);
        postToSidebar('Chat Error', 'Failed to process your message: ' + String(err), 'chat');
    }
}
/** Other AI Commands */
async function handleExplainCodeCommand(payload) {
    try {
        let code = payload?.code;
        const filePath = payload?.path;
        // Handle project-wide explanation
        if (filePath === 'project') {
            postToSidebar('Explain Project', 'Project-wide explanation is available through project analysis features.', 'explainCode');
            return;
        }
        if (!code) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                postToSidebar('Explain Code', 'Please open a file or select code to explain.', 'explainCode');
                return;
            }
            const sel = editor.selection;
            code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
        }
        if (!code?.trim()) {
            postToSidebar('Explain Code', 'No code provided to explain.', 'explainCode');
            return;
        }
        await runWithProgress('Analyzing code...', async (progress) => {
            progress.report({ message: 'Understanding the code structure...' });
            const prompt = `Please explain this code in detail:

\`\`\`
${code.substring(0, 3000)}
\`\`\`

Provide a clear explanation covering:
1. What this code does
2. Key functions/classes and their purposes
3. Data flow and important variables
4. Any notable patterns or architectures

Explanation:`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar('Code Explanation', response, 'explainCode');
        });
    }
    catch (err) {
        postToSidebar('Explanation Error', 'Failed to explain code: ' + String(err), 'explainCode');
        console.error(err);
    }
}
async function handleSummarizeFileCommand(payload) {
    try {
        let filePath = payload?.path;
        // Handle project-wide analysis
        if (filePath === 'project') {
            await handleGenerateProjectSummaryCommand();
            return;
        }
        if (!filePath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                postToSidebar('Summarize File', 'Please open a file to summarize.', 'summarizeFile');
                return;
            }
            filePath = editor.document.uri.fsPath;
        }
        const safePath = filePath;
        const doc = await vscode.workspace.openTextDocument(safePath);
        const content = doc.getText();
        if (!content.trim()) {
            postToSidebar('Summarize File', 'File is empty.', 'summarizeFile');
            return;
        }
        await runWithProgress('Summarizing file...', async (progress) => {
            progress.report({ message: 'Reading and analyzing file contents...' });
            const prompt = `Please provide a comprehensive summary of this file:

File: ${safePath.split(/[\\/]/).pop()}
Language: ${doc.languageId}

Content:
\`\`\`${doc.languageId}
${content.substring(0, 4000)}
\`\`\`

Please provide:
1. Overall purpose and main functionality
2. Key components (functions, classes, modules)
3. Architecture and design patterns
4. Dependencies and imports
5. Any notable complexity or important details

Summary:`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar(`File Summary - ${safePath.split(/[\\/]/).pop()}`, response, 'summarizeFile');
        });
    }
    catch (err) {
        postToSidebar('Summary Error', 'Failed to summarize file: ' + String(err), 'summarizeFile');
        console.error(err);
    }
}
async function handleFindBugsCommand(payload) {
    try {
        let code = payload?.code;
        const filePath = payload?.path;
        // Handle project-wide bug scan
        if (filePath === 'project') {
            await handleFindBugsInProjectCommand();
            return;
        }
        if (!code) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                postToSidebar('Find Bugs', 'Please open a file or select code to analyze.', 'findBugs');
                return;
            }
            const sel = editor.selection;
            code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
        }
        if (!code?.trim()) {
            postToSidebar('Find Bugs', 'No code provided to analyze.', 'findBugs');
            return;
        }
        await runWithProgress('Looking for issues...', async (progress) => {
            progress.report({ message: 'Scanning for potential bugs and issues...' });
            const prompt = `Analyze this code for potential issues, bugs, and problems:

\`\`\`
${code.substring(0, 3000)}
\`\`\`

Please identify:
1. Syntax errors or potential runtime errors
2. Logical errors or edge cases not handled
3. Security vulnerabilities
4. Performance issues
5. Code smells or anti-patterns
6. Potential improvements

For each issue found, provide:
- Issue type (bug, vulnerability, performance, etc.)
- Location or context
- Description of the problem
- Suggested fix

Analysis:`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar('Code Issues Analysis', response, 'findBugs');
        });
    }
    catch (err) {
        postToSidebar('Bug Analysis Error', 'Failed to analyze code for issues: ' + String(err), 'findBugs');
        console.error(err);
    }
}
async function handleSuggestImprovementsCommand(payload) {
    try {
        let code = payload?.code;
        const filePath = payload?.path;
        // Handle project-wide improvements
        if (filePath === 'project') {
            postToSidebar('Project Improvements', 'Use project analysis features for project-wide improvement suggestions.', 'suggestImprovements');
            return;
        }
        if (!code) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                postToSidebar('Improve Code', 'Please open a file or select code to improve.', 'suggestImprovements');
                return;
            }
            const sel = editor.selection;
            code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
        }
        if (!code?.trim()) {
            postToSidebar('Improve Code', 'No code provided to improve.', 'suggestImprovements');
            return;
        }
        await runWithProgress('Analyzing for improvements...', async (progress) => {
            progress.report({ message: 'Finding optimization opportunities...' });
            const prompt = `Suggest improvements for this code:

\`\`\`
${code.substring(0, 3000)}
\`\`\`

Please provide specific, actionable suggestions for:
1. Code readability and maintainability
2. Performance optimizations
3. Best practices implementation
4. Architecture and design improvements
5. Error handling and robustness
6. Testing and documentation

For each suggestion, include:
- What to change
- Why it's an improvement
- Example of the improved code (if applicable)

Improvement Suggestions:`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar('Code Improvement Suggestions', response, 'suggestImprovements');
        });
    }
    catch (err) {
        postToSidebar('Improvement Error', 'Failed to suggest improvements: ' + String(err), 'suggestImprovements');
        console.error(err);
    }
}
async function handleCodeUnderstandingSearchCommand(payload) {
    try {
        const query = payload?.query;
        if (!query?.trim()) {
            postToSidebar('Code Understanding Search', 'Please describe what code you\'re looking for.', 'codeUnderstandingSearch');
            return;
        }
        await runWithProgress('Understanding your code request...', async (progress) => {
            progress.report({ message: 'Scanning project for matching code...' });
            // Get all project files
            const files = await getAllProjectFiles();
            if (files.length === 0) {
                postToSidebar('Code Understanding Search', 'No files found in project.', 'codeUnderstandingSearch');
                return;
            }
            // Filter to source code files
            const sourceFiles = files.filter(file => {
                const ext = file.fsPath.split('.').pop() || '';
                const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
                return sourceExtensions.includes(ext);
            });
            progress.report({ message: `Analyzing ${sourceFiles.length} source files...` });
            // Read and analyze files for code that matches the description
            const matchingCodeSnippets = [];
            // Analyze files in batches to avoid overwhelming the AI
            const batchSize = 8;
            for (let i = 0; i < Math.min(sourceFiles.length, 30); i += batchSize) {
                const batch = sourceFiles.slice(i, i + batchSize);
                for (const file of batch) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(file);
                        const content = doc.getText();
                        if (content.trim().length < 10)
                            continue;
                        // Extract meaningful code segments (functions, classes, etc.)
                        const codeSegments = extractCodeSegments(content, doc.languageId);
                        if (codeSegments.length === 0)
                            continue;
                        // Analyze each significant code segment with AI
                        for (const segment of codeSegments.slice(0, 5)) { // Limit segments per file
                            const isRelevant = await analyzeCodeRelevance(query, segment.code, doc.languageId, segment.type);
                            if (isRelevant.relevant) {
                                matchingCodeSnippets.push({
                                    filePath: file.fsPath,
                                    fileName: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                                    language: doc.languageId,
                                    codeSnippet: segment.code,
                                    functionName: segment.name,
                                    lineNumber: segment.lineNumber,
                                    relevanceScore: isRelevant.confidence,
                                    explanation: isRelevant.explanation
                                });
                            }
                        }
                    }
                    catch (err) {
                        console.warn(`Could not analyze file: ${file.fsPath}`, err);
                    }
                }
                progress.report({
                    message: `Analyzed ${Math.min(i + batchSize, sourceFiles.length)}/${sourceFiles.length} files...`,
                    increment: (batchSize / sourceFiles.length) * 100
                });
            }
            // Sort by relevance score
            matchingCodeSnippets.sort((a, b) => b.relevanceScore - a.relevanceScore);
            if (matchingCodeSnippets.length === 0) {
                postToSidebar('Code Understanding Search', `No code found that matches: "${query}"\n\nTry describing what the code does in different words.`, 'codeUnderstandingSearch');
                return;
            }
            // Format results for the UI
            const formattedResults = {
                type: 'codeUnderstandingResults',
                title: 'Code Understanding Search',
                summary: `Found ${matchingCodeSnippets.length} code segments matching your description: "${query}"`,
                query: query,
                results: matchingCodeSnippets.slice(0, 10) // Top 10 results
            };
            postToSidebar('Code Understanding Results', formattedResults, 'codeUnderstandingSearch');
        });
    }
    catch (err) {
        postToSidebar('Code Understanding Error', 'Failed to search for matching code: ' + String(err), 'codeUnderstandingSearch');
        console.error(err);
    }
}
// Helper function to extract meaningful code segments from files
function extractCodeSegments(content, language) {
    const segments = [];
    const lines = content.split('\n');
    try {
        if (['javascript', 'typescript'].includes(language)) {
            // Extract functions, classes, and significant blocks
            const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)|class\s+(\w+))/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const name = match[1] || match[2] || match[3];
                const startLine = content.substring(0, match.index).split('\n').length;
                // Extract the function/class body
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock) {
                    segments.push({
                        name: name,
                        code: codeBlock,
                        type: match[3] ? 'class' : 'function',
                        lineNumber: startLine
                    });
                }
            }
        }
        if (language === 'python') {
            // Python functions and classes
            const functionRegex = /def\s+(\w+)\s*\(/g;
            const classRegex = /class\s+(\w+)\s*\(?/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock) {
                    segments.push({
                        name: match[1],
                        code: codeBlock,
                        type: 'function',
                        lineNumber: startLine
                    });
                }
            }
            while ((match = classRegex.exec(content)) !== null) {
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock) {
                    segments.push({
                        name: match[1],
                        code: codeBlock,
                        type: 'class',
                        lineNumber: startLine
                    });
                }
            }
        }
        // If no functions/classes found, extract significant code blocks
        if (segments.length === 0) {
            // Extract the first substantial code block (non-import/comment)
            const substantialStart = lines.findIndex(line => line.trim().length > 0 &&
                !line.trim().startsWith('//') &&
                !line.trim().startsWith('#') &&
                !line.trim().startsWith('import') &&
                !line.trim().startsWith('from ') &&
                !line.trim().startsWith('package ') &&
                !line.trim().startsWith('using '));
            if (substantialStart !== -1) {
                const codeBlock = lines.slice(substantialStart, Math.min(substantialStart + 20, lines.length)).join('\n');
                segments.push({
                    name: 'main',
                    code: codeBlock,
                    type: 'code block',
                    lineNumber: substantialStart + 1
                });
            }
        }
    }
    catch (err) {
        console.warn('Error extracting code segments:', err);
    }
    return segments;
}
// Helper function to extract a code block (function, class, etc.)
function extractCodeBlock(content, startIndex, language) {
    try {
        const bracketLanguages = ['javascript', 'typescript', 'java', 'cpp', 'c', 'cs', 'php', 'go', 'rust'];
        const indentLanguages = ['python', 'ruby'];
        if (bracketLanguages.includes(language)) {
            // Extract code within curly braces
            let braceCount = 0;
            let inBlock = false;
            let endIndex = startIndex;
            for (let i = startIndex; i < content.length; i++) {
                if (content[i] === '{') {
                    braceCount++;
                    inBlock = true;
                }
                else if (content[i] === '}') {
                    braceCount--;
                }
                if (inBlock && braceCount === 0 && content[i] === '}') {
                    endIndex = i + 1;
                    break;
                }
            }
            return content.substring(startIndex, endIndex).trim();
        }
        else if (indentLanguages.includes(language)) {
            // Extract indented block for Python
            const lines = content.substring(startIndex).split('\n');
            if (lines.length === 0)
                return '';
            const firstLine = lines[0];
            const baseIndent = firstLine.match(/^\s*/)?.[0].length || 0;
            const codeLines = [firstLine];
            for (let i = 1; i < lines.length; i++) {
                const currentIndent = lines[i].match(/^\s*/)?.[0].length || 0;
                if (currentIndent > baseIndent || lines[i].trim() === '') {
                    codeLines.push(lines[i]);
                }
                else {
                    break;
                }
            }
            return codeLines.join('\n').trim();
        }
    }
    catch (err) {
        console.warn('Error extracting code block:', err);
    }
    // Fallback: return a reasonable snippet
    return content.substring(startIndex, Math.min(startIndex + 500, content.length)).trim();
}
// Helper function to analyze if code is relevant to the query using AI
async function analyzeCodeRelevance(query, code, language, codeType) {
    try {
        const prompt = `I'm looking for code that: "${query}"
    
Here is a ${codeType} (${language}) from my project:
\`\`\`${language}
${code.substring(0, 1500)}
\`\`\`

Please analyze if this code matches what I'm looking for. Consider:
- What the code actually does
- Its purpose and functionality
- Key operations it performs
- Patterns or architectures it uses

Respond with a JSON object:
{
  "relevant": true/false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of why it matches or doesn't match"
}

IMPORTANT: Return ONLY valid JSON, no other text.`;
        const response = await (0, callAI_1.callAI)(prompt);
        console.log('AI Response for code relevance:', response);
        // Parse JSON response
        try {
            // Try to find JSON in the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    relevant: result.relevant === true,
                    confidence: Math.min(1.0, Math.max(0.0, result.confidence || 0.5)),
                    explanation: result.explanation || 'No explanation provided'
                };
            }
        }
        catch (parseErr) {
            console.warn('Failed to parse AI response as JSON:', parseErr);
            console.warn('Raw response was:', response);
        }
        // Fallback: analyze the text response for relevance indicators
        return analyzeTextResponseForRelevance(response, query, code);
    }
    catch (err) {
        console.warn('Error analyzing code relevance:', err);
        return {
            relevant: false,
            confidence: 0.0,
            explanation: 'Error analyzing code relevance'
        };
    }
}
// Fallback function to analyze text response when JSON parsing fails
function analyzeTextResponseForRelevance(response, query, code) {
    const responseLower = response.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
    const codeLower = code.toLowerCase();
    // Check for positive indicators in the response
    const positiveIndicators = [
        'relevant', 'matches', 'yes', 'true', 'correct', 'appropriate',
        'fits', 'suitable', 'related', 'similar', 'does match', 'is relevant'
    ];
    const negativeIndicators = [
        'not relevant', 'no', 'false', 'does not match', 'unrelated',
        'different', 'irrelevant', 'not what', 'no match'
    ];
    let relevant = false;
    let confidence = 0.5;
    let explanation = 'AI response could not be parsed, using fallback analysis';
    // Check for explicit positive/negative indicators
    const hasPositive = positiveIndicators.some(indicator => responseLower.includes(indicator));
    const hasNegative = negativeIndicators.some(indicator => responseLower.includes(indicator));
    if (hasPositive && !hasNegative) {
        relevant = true;
        confidence = 0.7;
        explanation = 'AI indicated this code is relevant to your query';
    }
    else if (hasNegative && !hasPositive) {
        relevant = false;
        confidence = 0.3;
        explanation = 'AI indicated this code is not relevant to your query';
    }
    else {
        // Use keyword matching as fallback
        const matches = queryTerms.filter(term => codeLower.includes(term)).length;
        const keywordConfidence = matches / Math.max(1, queryTerms.length);
        relevant = keywordConfidence > 0.3;
        confidence = keywordConfidence;
        explanation = `Matched ${matches} of ${queryTerms.length} key terms from your query`;
    }
    return {
        relevant,
        confidence,
        explanation
    };
}
// Add this new function for semantic function search
async function handleSemanticFunctionSearchCommand(payload) {
    try {
        const query = payload?.query;
        if (!query?.trim()) {
            postToSidebar('Semantic Function Search', 'Please describe what functions you\'re looking for.', 'semanticFunctionSearch');
            return;
        }
        await runWithProgress('Searching for functions...', async (progress) => {
            progress.report({ message: 'Scanning project for matching functions...' });
            // Get all project files
            const files = await getAllProjectFiles();
            if (files.length === 0) {
                postToSidebar('Semantic Function Search', 'No files found in project.', 'semanticFunctionSearch');
                return;
            }
            // Filter to source code files
            const sourceFiles = files.filter(file => {
                const ext = file.fsPath.split('.').pop() || '';
                const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
                return sourceExtensions.includes(ext);
            });
            progress.report({ message: `Analyzing ${sourceFiles.length} source files...` });
            const functionResults = [];
            // Analyze files for functions
            for (let i = 0; i < Math.min(sourceFiles.length, 30); i++) {
                const file = sourceFiles[i];
                progress.report({
                    message: `Analyzing ${file.fsPath.split(/[\\/]/).pop()}...`,
                    increment: (100 / Math.min(sourceFiles.length, 30))
                });
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const content = doc.getText();
                    if (content.trim().length < 10)
                        continue;
                    // Extract all functions from the file
                    const functions = extractAllFunctions(content, doc.languageId, file.fsPath);
                    // Analyze each function for relevance
                    for (const func of functions.slice(0, 10)) { // Limit functions per file
                        const isRelevant = await analyzeFunctionRelevance(query, func, doc.languageId);
                        if (isRelevant.relevant) {
                            functionResults.push({
                                filePath: file.fsPath,
                                fileName: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                                language: doc.languageId,
                                functionName: func.name,
                                functionType: func.type,
                                codeSnippet: func.code,
                                lineNumber: func.lineNumber,
                                relevanceScore: isRelevant.confidence,
                                explanation: isRelevant.explanation
                            });
                        }
                    }
                }
                catch (err) {
                    console.warn(`Could not analyze file: ${file.fsPath}`, err);
                }
            }
            // Sort by relevance score
            functionResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
            if (functionResults.length === 0) {
                postToSidebar('Semantic Function Search', `No functions found that match: "${query}"\n\nTry describing the function purpose in different words.`, 'semanticFunctionSearch');
                return;
            }
            // Format results for the UI
            const formattedResults = {
                type: 'functionSearchResults',
                title: 'Function Search Results',
                summary: `Found ${functionResults.length} functions matching your description: "${query}"`,
                query: query,
                results: functionResults.slice(0, 15) // Top 15 results
            };
            postToSidebar('Function Search Results', formattedResults, 'semanticFunctionSearch');
        });
    }
    catch (err) {
        postToSidebar('Function Search Error', 'Failed to search for functions: ' + String(err), 'semanticFunctionSearch');
        console.error(err);
    }
}
// Enhanced function extraction
function extractAllFunctions(content, language, filePath) {
    const functions = [];
    const lines = content.split('\n');
    try {
        if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
            // Function declarations
            const functionDeclRegex = /function\s+(\w+)\s*\([^)]*\)\s*{/g;
            // Arrow functions and const assignments
            const arrowFunctionRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\))\s*{/g;
            // Method definitions in classes
            const methodRegex = /(?:public|private|protected|static)?\s*(\w+)\s*\([^)]*\)\s*{/g;
            // Class declarations
            const classRegex = /class\s+(\w+)/g;
            let match;
            // Function declarations
            while ((match = functionDeclRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'function',
                        lineNumber: startLine,
                        signature: `function ${name}()`
                    });
                }
            }
            // Arrow functions
            while ((match = arrowFunctionRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'arrow function',
                        lineNumber: startLine,
                        signature: `const ${name} = () => {}`
                    });
                }
            }
            // Classes
            while ((match = classRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'class',
                        lineNumber: startLine,
                        signature: `class ${name}`
                    });
                }
            }
        }
        if (language === 'python') {
            // Python functions
            const functionRegex = /def\s+(\w+)\s*\([^)]*\):/g;
            // Python classes
            const classRegex = /class\s+(\w+)\s*\(?/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'function',
                        lineNumber: startLine,
                        signature: `def ${name}()`
                    });
                }
            }
            while ((match = classRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'class',
                        lineNumber: startLine,
                        signature: `class ${name}`
                    });
                }
            }
        }
        // Java support
        if (language === 'java') {
            const methodRegex = /(?:public|private|protected)\s+(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*\{/g;
            const classRegex = /class\s+(\w+)/g;
            let match;
            while ((match = methodRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'method',
                        lineNumber: startLine,
                        signature: `${name}()`
                    });
                }
            }
            while ((match = classRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const codeBlock = extractCodeBlock(content, match.index, language);
                if (codeBlock && name) {
                    functions.push({
                        name,
                        code: codeBlock,
                        type: 'class',
                        lineNumber: startLine,
                        signature: `class ${name}`
                    });
                }
            }
        }
    }
    catch (err) {
        console.warn('Error extracting functions:', err);
    }
    return functions;
}
// Enhanced function relevance analysis
async function analyzeFunctionRelevance(query, func, language) {
    try {
        const prompt = `I'm looking for functions that: "${query}"
    
Here is a ${func.type} from my project:
Name: ${func.name}
Type: ${func.type}
Signature: ${func.signature}
Language: ${language}

Code:
\`\`\`${language}
${func.code.substring(0, 1200)}
\`\`\`

Analyze if this function matches what I'm looking for. Consider:
- What the function actually does
- Its purpose and functionality
- Input parameters and return values
- Key operations it performs
- Whether it matches the described behavior

Respond with a JSON object:
{
  "relevant": true/false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of why it matches or doesn't match, focusing on the function's actual behavior"
}

IMPORTANT: Return ONLY valid JSON, no other text.`;
        const response = await (0, callAI_1.callAI)(prompt);
        // Parse JSON response
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    relevant: result.relevant === true,
                    confidence: Math.min(1.0, Math.max(0.0, result.confidence || 0.5)),
                    explanation: result.explanation || 'No explanation provided'
                };
            }
        }
        catch (parseErr) {
            console.warn('Failed to parse AI response as JSON:', parseErr);
        }
        // Fallback analysis
        return analyzeFunctionTextResponse(response, query, func);
    }
    catch (err) {
        console.warn('Error analyzing function relevance:', err);
        return {
            relevant: false,
            confidence: 0.0,
            explanation: 'Error analyzing function relevance'
        };
    }
}
// Enhanced fallback function analysis
function analyzeFunctionTextResponse(response, query, func) {
    const responseLower = response.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
    const codeLower = func.code.toLowerCase();
    const nameLower = func.name.toLowerCase();
    // Check for positive indicators
    const positiveIndicators = [
        'relevant', 'matches', 'yes', 'true', 'correct', 'appropriate',
        'fits', 'suitable', 'related', 'similar', 'does match', 'is relevant',
        'this function', 'exactly what', 'perfect match'
    ];
    const negativeIndicators = [
        'not relevant', 'no', 'false', 'does not match', 'unrelated',
        'different', 'irrelevant', 'not what', 'no match', 'not the function'
    ];
    let relevant = false;
    let confidence = 0.5;
    let explanation = 'AI response could not be parsed, using fallback analysis';
    // Check AI response sentiment
    const hasPositive = positiveIndicators.some(indicator => responseLower.includes(indicator));
    const hasNegative = negativeIndicators.some(indicator => responseLower.includes(indicator));
    if (hasPositive && !hasNegative) {
        relevant = true;
        confidence = 0.8;
        explanation = 'AI indicated this function matches your query';
    }
    else if (hasNegative && !hasPositive) {
        relevant = false;
        confidence = 0.2;
        explanation = 'AI indicated this function does not match your query';
    }
    else {
        // Use keyword matching and function name analysis
        const functionNameScore = queryTerms.some(term => nameLower.includes(term) || term.includes(nameLower)) ? 0.6 : 0.3;
        const codeMatches = queryTerms.filter(term => codeLower.includes(term)).length;
        const codeScore = codeMatches / Math.max(1, queryTerms.length);
        confidence = Math.max(functionNameScore, codeScore * 0.8);
        relevant = confidence > 0.4;
        explanation = `Function name and code analysis: ${Math.round(confidence * 100)}% match`;
    }
    return {
        relevant,
        confidence,
        explanation
    };
}
// Helper function to extract function names from code
function extractFunctionNames(content, language) {
    const functionNames = [];
    try {
        // JavaScript/TypeScript function patterns
        if (['javascript', 'typescript'].includes(language)) {
            const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)|class\s+(\w+))/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const name = match[1] || match[2] || match[3];
                if (name && !functionNames.includes(name)) {
                    functionNames.push(name);
                }
            }
        }
        // Python function patterns
        if (language === 'python') {
            const functionRegex = /def\s+(\w+)\s*\(/g;
            const classRegex = /class\s+(\w+)\s*\(?/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                if (match[1] && !functionNames.includes(match[1])) {
                    functionNames.push(match[1]);
                }
            }
            while ((match = classRegex.exec(content)) !== null) {
                if (match[1] && !functionNames.includes(match[1])) {
                    functionNames.push(match[1]);
                }
            }
        }
        // Java function patterns
        if (language === 'java') {
            const methodRegex = /(?:public|private|protected)\s+(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*(?:\{|\w+)/g;
            const classRegex = /class\s+(\w+)/g;
            let match;
            while ((match = methodRegex.exec(content)) !== null) {
                if (match[1] && !functionNames.includes(match[1])) {
                    functionNames.push(match[1]);
                }
            }
            while ((match = classRegex.exec(content)) !== null) {
                if (match[1] && !functionNames.includes(match[1])) {
                    functionNames.push(match[1]);
                }
            }
        }
    }
    catch (err) {
        console.warn('Error extracting function names:', err);
    }
    return functionNames.slice(0, 5); // Limit to 5 function names
}
// Helper function to extract relevant code snippets based on query
function extractRelevantCodeSnippet(content, query) {
    try {
        const lines = content.split('\n');
        const queryTerms = query.toLowerCase().split(/\s+/);
        // Find lines that contain query terms
        const relevantLines = [];
        lines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();
            if (queryTerms.some(term => term.length > 3 && lowerLine.includes(term))) {
                relevantLines.push(index);
            }
        });
        if (relevantLines.length > 0) {
            // Get context around the first relevant line
            const firstLine = Math.max(0, relevantLines[0] - 3);
            const lastLine = Math.min(lines.length - 1, relevantLines[0] + 8);
            return lines.slice(firstLine, lastLine + 1).join('\n');
        }
        // Fallback: return beginning of file if no specific matches
        return lines.slice(0, 15).join('\n');
    }
    catch (err) {
        console.warn('Error extracting code snippet:', err);
        return content.substring(0, 200) + '...';
    }
}
// Helper function to find relevant line numbers
function findRelevantLineNumber(content, query) {
    try {
        const lines = content.split('\n');
        const queryTerms = query.toLowerCase().split(/\s+/);
        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            if (queryTerms.some(term => term.length > 3 && lowerLine.includes(term))) {
                return i + 1; // Convert to 1-based line numbers
            }
        }
        return 1; // Default to first line
    }
    catch (err) {
        return 1;
    }
}
// Helper function to parse confidence scores from AI response
function parseConfidenceScores(aiResponse, results) {
    const scores = new Array(results.length).fill(0.7); // Default scores
    try {
        // Look for confidence patterns in AI response
        results.forEach((result, index) => {
            const fileName = result.fileName;
            const regex = new RegExp(`${fileName}.*?(\\d?\\.?\\d+)(?:/\\d+\\.\\d)?\\s*[Cc]onfidence`, 'i');
            const match = aiResponse.match(regex);
            if (match && match[1]) {
                scores[index] = Math.min(1.0, Math.max(0.1, parseFloat(match[1])));
            }
            else {
                // Simple relevance scoring based on position and content matches
                scores[index] = 0.8 - (index * 0.05);
            }
        });
    }
    catch (err) {
        console.warn('Error parsing confidence scores:', err);
    }
    return scores;
}
/** Helper Functions */
function isCodeRelatedQuery(query) {
    const codeKeywords = [
        'code', 'function', 'class', 'method', 'variable', 'import', 'export',
        'react', 'component', 'hook', 'angular', 'vue', 'node', 'python',
        'javascript', 'typescript', 'java', 'c#', 'php', 'ruby', 'go',
        'rust', 'html', 'css', 'sql', 'database', 'api', 'endpoint',
        'sort', 'filter', 'search', 'algorithm', 'data structure'
    ];
    const lowerQuery = query.toLowerCase();
    return codeKeywords.some(keyword => lowerQuery.includes(keyword));
}
/** Legacy Commands - Redirect to RAG */
async function handleAskAICommand(payload) {
    await handleExplainCodeCommand(payload);
}
async function handleSmartExplainCommand(payload) {
    await handleExplainCodeCommand(payload);
}
async function handleDeepAnalysisCommand(payload) {
    await handleFindBugsCommand(payload);
}
async function handlePatternAnalysisCommand() {
    // Implement pattern analysis or redirect to chat
    postToSidebar('Pattern Analysis', 'Pattern analysis is now integrated into the main chat. Try asking about specific patterns in your code.', 'patternAnalysis');
}
async function handleAnalyzeSearchResultsCommand() {
    postToSidebar('Search Analysis', 'Search analysis is now integrated into the main chat. Try asking questions about your codebase.', 'analyzeSearchResults');
}
// Add debug function for testing thresholds
async function debugSimilarityScores(payload) {
    const query = payload?.query || 'where is the function that does sort';
    console.log(' Debugging similarity scores for:', query);
    const results = await (0, pipeline_1.runRetrievalPipeline)(query, 10, 0.0); // No filtering
    console.log(' ALL RESULTS (no filtering):');
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.filename} - ${(r.relevance || 0).toFixed(3)} - ${r.filepath}`);
        if (i < 3)
            console.log(`   Code: ${r.content.substring(0, 100)}...`);
    });
    // Show what WOULD pass different thresholds
    const thresholds = [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    thresholds.forEach(threshold => {
        const passed = results.filter(r => (r.relevance || 0) >= threshold).length;
        console.log(` At ${threshold * 100}% threshold: ${passed}/${results.length} results`);
    });
    postToSidebar('Debug Results', {
        query: query,
        totalResults: results.length,
        thresholds: thresholds.map(t => ({
            threshold: t,
            passed: results.filter(r => (r.relevance || 0) >= t).length
        })),
        topResults: results.slice(0, 5).map(r => ({
            file: r.filename,
            similarity: r.relevance?.toFixed(3),
            preview: r.content.substring(0, 100)
        }))
    }, 'debug');
}
/** Legacy search commands for compatibility */
async function handleBuildSearchIndexCommand() {
    try {
        const results = await (0, search_1.buildSearchIndex)();
        postToSidebar('Index Built', `Successfully indexed ${results.length} files`, 'buildSearchIndex');
    }
    catch (err) {
        postToSidebar('Index Error', 'Failed to build index: ' + String(err), 'buildSearchIndex');
    }
}
async function handleSearchStatsCommand() {
    try {
        const stats = (0, search_1.getSearchStats)();
        postToSidebar('Search Statistics', stats, 'searchStats');
    }
    catch (err) {
        postToSidebar('Stats Error', 'Failed to get statistics: ' + String(err), 'searchStats');
    }
}
async function handleSearchByLanguageCommand(payload) {
    try {
        const lang = payload?.language;
        if (!lang) {
            postToSidebar('Language Search', 'Please specify a language to search for.', 'searchByLanguage');
            return;
        }
        const results = (0, search_1.searchByLanguage)(lang);
        if (results.length === 0) {
            postToSidebar(`Files in ${lang}`, `No ${lang} files found in the project.`, 'searchByLanguage');
            return;
        }
        // Format results for interactive UI display
        const formattedResults = {
            type: 'fileList',
            title: `Files in ${lang}`,
            summary: `Found ${results.length} files in ${lang}`,
            files: results.map((r) => ({
                fileName: r.fileName,
                filePath: r.filePath,
                language: r.language,
                lineCount: r.lineCount || 0
            }))
        };
        postToSidebar(`Files in ${lang}`, formattedResults, 'searchByLanguage');
    }
    catch (err) {
        postToSidebar('Language Search Error', 'Search failed: ' + String(err), 'searchByLanguage');
    }
}
async function handleClearSearchIndexCommand() {
    try {
        (0, search_1.clearSearchIndex)();
        postToSidebar('Index Cleared', 'Search index has been cleared', 'clearSearchIndex');
    }
    catch (err) {
        postToSidebar('Clear Error', 'Failed to clear index: ' + String(err), 'clearSearchIndex');
    }
}
async function handleQuickFileSearchCommand() {
    try {
        const recent = (0, search_1.searchIndex)('', 15);
        if (recent.length === 0) {
            postToSidebar('Quick Search', 'No files indexed. Build index first.', 'quickFileSearch');
            return;
        }
        const items = recent.map((f) => ({
            label: f.fileName,
            description: f.filePath,
            file: f,
        }));
        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Quick file search',
        });
        if (pick) {
            const doc = await vscode.workspace.openTextDocument(pick.file.filePath);
            await vscode.window.showTextDocument(doc);
        }
    }
    catch (err) {
        postToSidebar('Quick Search Error', 'Quick search failed: ' + String(err), 'quickFileSearch');
    }
}
// ---------------------------------------------------------------------------
function activate(context) {
    console.log('Activating VS Code AI Extension with PURE RAG (10% similarity threshold)...');
    // Initialize BOTH RAG storage systems and legacy search
    try {
        (0, embeddings_1.initializeEmbeddingStorage)(context);
        (0, retrieve_1.initializeVectorStore)(context);
        console.log('RAG storage systems initialized');
    }
    catch (e) {
        console.error('RAG storage initialization failed:', e);
    }
    try {
        (0, search_1.initializeSearch)(context);
    }
    catch (e) {
        console.warn('initializeSearch error', e);
    }
    // Initialize RAG embeddings in background
    setTimeout(async () => {
        try {
            console.log('Initializing RAG embeddings...');
            await (0, pipeline_1.initializeEmbeddings)();
            console.log(' RAG embeddings initialized');
            // Show ready message
            const stats = await (0, retrieve_1.getVectorStoreStats)();
            console.log(' RAG Stats:', stats);
            postToSidebar('RAG Ready', {
                message: 'AI Assistant is ready with semantic search (10% threshold)!',
                stats: stats,
                similarityThreshold: '10%',
                instructions: 'Ask natural language questions about your codebase like "where is the sorting function" or "show me authentication code"'
            }, 'ready');
        }
        catch (e) {
            console.error('RAG embeddings initialization failed:', e);
            postToSidebar('RAG Initialization Failed', 'Semantic search may not work properly. Try using the "Rebuild RAG Index" command.', 'error');
        }
    }, 2000); // Increased delay to ensure workspace is ready
    // Register sidebar
    try {
        const refMgr = (() => {
            try {
                return refactor_manager_1.RefactorManager.getInstance(context);
            }
            catch {
                return undefined;
            }
        })();
        const provider = new sidebar_view_provider_1.SidebarViewProvider(context.extensionUri, refMgr);
        sidebarProvider = provider;
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebar_view_provider_1.SidebarViewProvider.viewId, provider, { webviewOptions: { retainContextWhenHidden: true } }));
    }
    catch (e) {
        console.error('Sidebar registration failed', e);
    }
    // Register ALL commands - both RAG and legacy
    const regs = [
        // Pure RAG Search Commands
        vscode.commands.registerCommand('vs-code-ai-extension.semanticSearch', handleSemanticSearchCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.searchProject', handleSearchProjectCommand),
        // RAG Diagnostic Commands
        vscode.commands.registerCommand('vs-code-ai-extension.ragDiagnostics', handleRAGDiagnosticsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.rebuildRAGIndex', handleRebuildRAGIndexCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.testRAG', handleTestRAGCommand),
        // AI Commands with RAG
        vscode.commands.registerCommand('vs-code-ai-extension.chat', handleChatCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.explainCode', handleExplainCodeCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.findBugs', handleFindBugsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.suggestImprovements', handleSuggestImprovementsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.codeUnderstandingSearch', handleCodeUnderstandingSearchCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.semanticFunctionSearch', handleSemanticFunctionSearchCommand),
        // Project-wide commands
        vscode.commands.registerCommand('vs-code-ai-extension.analyzeProject', handleAnalyzeEntireProjectCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.findBugsInProject', handleFindBugsInProjectCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.generateProjectSummary', handleGenerateProjectSummaryCommand),
        // Debug commands
        vscode.commands.registerCommand('vs-code-ai-extension.debugEmbeddings', async () => {
            console.log(' DEBUGGING EMBEDDINGS - Command is working!');
            try {
                const { generateEmbedding } = await Promise.resolve().then(() => __importStar(require('./ai/callAI')));
                const { calculateCosineSimilarity } = await Promise.resolve().then(() => __importStar(require('../core/similarity')));
                const tests = [
                    { text: "config", desc: "simple config" },
                    { text: "configuration", desc: "similar to config" },
                    { text: "sort", desc: "different concept" },
                ];
                for (const test of tests) {
                    const embedding = await generateEmbedding(test.text);
                    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
                    console.log(`\n "${test.text}": Dim=${embedding.length}, Magnitude=${magnitude.toFixed(3)}`);
                }
                // Test similarities
                console.log('\n SEMANTIC RELATIONSHIPS:');
                const emb1 = await generateEmbedding("config");
                const emb2 = await generateEmbedding("configuration");
                const emb3 = await generateEmbedding("sort");
                console.log(`   config vs configuration: ${calculateCosineSimilarity(emb1, emb2).toFixed(3)}`);
                console.log(`   config vs sort: ${calculateCosineSimilarity(emb1, emb3).toFixed(3)}`);
            }
            catch (error) {
                console.error('Debug command failed:', error);
            }
        }),
        // NEW: Debug similarity scores
        vscode.commands.registerCommand('vs-code-ai-extension.debugSimilarity', () => debugSimilarityScores({ query: 'where is the function that does sort' })),
        // Legacy compatibility (redirect to RAG)
        vscode.commands.registerCommand('vs-code-ai-extension.askAI', handleAskAICommand),
        vscode.commands.registerCommand('vs-code-ai-extension.smartExplain', handleSmartExplainCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.deepAnalysis', handleDeepAnalysisCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.patternAnalysis', handlePatternAnalysisCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.analyzeSearchResults', handleAnalyzeSearchResultsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.summarizeFile', handleSummarizeFileCommand),
        // Legacy search commands
        vscode.commands.registerCommand('vs-code-ai-extension.buildSearchIndex', handleBuildSearchIndexCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.searchStats', handleSearchStatsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.searchByLanguage', handleSearchByLanguageCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.clearSearchIndex', handleClearSearchIndexCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.quickFileSearch', handleQuickFileSearchCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.showSidebar', async () => {
            try {
                await vscode.commands.executeCommand('workbench.view.extension.vsCodeAI');
            }
            catch {
                // Ignore errors
            }
            setTimeout(() => sidebarProvider?.refresh(), 400);
        }),
    ];
    regs.forEach((r) => context.subscriptions.push(r));
    // Build legacy search index shortly after activation
    setTimeout(() => {
        (0, search_1.buildSearchIndex)()
            .then((res) => {
            if (res && res.length > 0) {
                console.log(`Legacy search indexed ${res.length} files`);
            }
        })
            .catch(() => { });
    }, 3000);
    // Auto update legacy index on save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.fileName.includes('node_modules'))
            return;
        setTimeout(() => {
            (0, search_1.buildSearchIndex)().catch(() => { });
        }, 1000);
    }));
    console.log('VS Code AI Extension with PURE RAG (10% similarity threshold) activated');
}
function deactivate() {
    console.log('VS Code AI Extension deactivated');
}
//# sourceMappingURL=extension.js.map