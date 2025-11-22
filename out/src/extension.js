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
exports.handleChatCommand = handleChatCommand;
exports.handleExplainCodeCommand = handleExplainCodeCommand;
exports.handleSummarizeFileCommand = handleSummarizeFileCommand;
exports.handleFindBugsCommand = handleFindBugsCommand;
exports.handleSuggestImprovementsCommand = handleSuggestImprovementsCommand;
exports.handleCodeUnderstandingSearchCommand = handleCodeUnderstandingSearchCommand;
exports.handleSemanticSearchCommand = handleSemanticSearchCommand;
exports.handleAskAICommand = handleAskAICommand;
exports.handleSmartExplainCommand = handleSmartExplainCommand;
exports.handleDeepAnalysisCommand = handleDeepAnalysisCommand;
exports.handlePatternAnalysisCommand = handlePatternAnalysisCommand;
exports.handleAnalyzeSearchResultsCommand = handleAnalyzeSearchResultsCommand;
exports.handleSearchProjectCommand = handleSearchProjectCommand;
exports.handleBuildSearchIndexCommand = handleBuildSearchIndexCommand;
exports.handleSearchStatsCommand = handleSearchStatsCommand;
exports.handleSearchByLanguageCommand = handleSearchByLanguageCommand;
exports.handleClearSearchIndexCommand = handleClearSearchIndexCommand;
exports.handleQuickFileSearchCommand = handleQuickFileSearchCommand;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const callAI_1 = require("./ai/callAI");
const search_1 = require("./search");
const sidebar_view_provider_1 = require("./webviews/sidebar-view-provider");
const refactor_manager_1 = require("./refactoring/refactor-manager");
let sidebarProvider;
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
async function handleAnalyzeEntireProjectCommand() {
    try {
        await runWithProgress('Analyzing entire project...', async (progress) => {
            progress.report({ message: 'Scanning project files...' });
            const files = await getAllProjectFiles();
            if (files.length === 0) {
                postToSidebar('Project Analysis', 'No files found in workspace.', 'analyzeProject');
                return;
            }
            progress.report({ message: `Found ${files.length} files, analyzing key files...` });
            let combinedContent = '';
            let filesProcessed = 0;
            const importantFiles = files.filter(file => {
                const name = file.fsPath.toLowerCase();
                return !name.includes('node_modules') &&
                    !name.includes('dist') &&
                    !name.includes('build') &&
                    !name.includes('.git');
            }).sort((a, b) => {
                const aIsConfig = a.fsPath.includes('config') || a.fsPath.includes('package.json');
                const bIsConfig = b.fsPath.includes('config') || b.fsPath.includes('package.json');
                return aIsConfig === bIsConfig ? 0 : aIsConfig ? 1 : -1;
            });
            for (const file of importantFiles.slice(0, 30)) {
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const content = doc.getText();
                    if (content.trim().length > 10) {
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
        await runWithProgress('Scanning project for bugs...', async (progress) => {
            progress.report({ message: 'Collecting project files...' });
            const files = await getAllProjectFiles();
            const bugReports = [];
            if (files.length === 0) {
                postToSidebar('Project Bug Scan', 'No files found to analyze.', 'findBugsInProject');
                return;
            }
            const sourceFiles = files.filter(file => {
                const ext = file.fsPath.split('.').pop() || '';
                const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
                return sourceExtensions.includes(ext);
            });
            for (let i = 0; i < Math.min(sourceFiles.length, 25); i++) {
                const file = sourceFiles[i];
                progress.report({
                    message: `Analyzing ${file.fsPath.split(/[\\/]/).pop()} (${i + 1}/${Math.min(sourceFiles.length, 25)})...`,
                    increment: (100 / Math.min(sourceFiles.length, 25))
                });
                try {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const content = doc.getText();
                    const language = doc.languageId || getLanguageFromExtension(file.fsPath.split('.').pop() || '');
                    if (content.length > 50) {
                        const bugReport = await analyzeFileForBugs(file.fsPath.split(/[\\/]/).pop() || 'unknown', content, language);
                        if (bugReport) {
                            bugReports.push(bugReport);
                        }
                    }
                }
                catch (err) {
                    console.warn(`Could not analyze file: ${file.fsPath}`, err);
                }
            }
            if (bugReports.length === 0) {
                postToSidebar('Project Bug Scan', 'No significant issues found in scanned files.', 'findBugsInProject');
                return;
            }
            const combinedReport = `## Project Bug Scan Report\n\n**Files Analyzed:** ${Math.min(sourceFiles.length, 25)} source files\n\n${bugReports.join('\n\n---\n\n')}`;
            postToSidebar('Project Bug Report', combinedReport, 'findBugsInProject');
        });
    }
    catch (err) {
        postToSidebar('Bug Scan Error', 'Failed to scan project for bugs: ' + String(err), 'findBugsInProject');
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
            files.forEach(file => {
                const ext = file.fsPath.split('.').pop() || 'none';
                const lang = getLanguageFromExtension(ext);
                fileStats.byExtension[ext] = (fileStats.byExtension[ext] || 0) + 1;
                fileStats.byLanguage[lang] = (fileStats.byLanguage[lang] || 0) + 1;
            });
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
async function handleChatCommand(payload) {
    try {
        const userMessage = payload?.message;
        if (!userMessage?.trim()) {
            postToSidebar('Chat', 'Please enter a message.', 'chat');
            return;
        }
        await runWithProgress('AI is thinking...', async (progress) => {
            progress.report({ message: 'Processing your question...' });
            const prompt = `You are a helpful AI coding assistant. The user is asking: "${userMessage}"

Please provide a helpful, concise response focused on coding assistance. If they're asking about code, provide practical examples and explanations.

Response:`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar('Chat Response', response, 'chat');
        });
    }
    catch (err) {
        postToSidebar('Chat Error', 'Failed to process your message: ' + String(err), 'chat');
        console.error(err);
    }
}
async function handleExplainCodeCommand(payload) {
    try {
        let code = payload?.code;
        const filePath = payload?.path;
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
            const files = await getAllProjectFiles();
            if (files.length === 0) {
                postToSidebar('Code Understanding Search', 'No files found in project.', 'codeUnderstandingSearch');
                return;
            }
            const sourceFiles = files.filter(file => {
                const ext = file.fsPath.split('.').pop() || '';
                const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
                return sourceExtensions.includes(ext);
            });
            progress.report({ message: `Analyzing ${sourceFiles.length} source files...` });
            const matchingCodeSnippets = [];
            const batchSize = 8;
            for (let i = 0; i < Math.min(sourceFiles.length, 30); i += batchSize) {
                const batch = sourceFiles.slice(i, i + batchSize);
                for (const file of batch) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(file);
                        const content = doc.getText();
                        if (content.trim().length < 10)
                            continue;
                        const codeSegments = extractCodeSegments(content, doc.languageId);
                        if (codeSegments.length === 0)
                            continue;
                        for (const segment of codeSegments.slice(0, 5)) {
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
            matchingCodeSnippets.sort((a, b) => b.relevanceScore - a.relevanceScore);
            if (matchingCodeSnippets.length === 0) {
                postToSidebar('Code Understanding Search', `No code found that matches: "${query}"\n\nTry describing what the code does in different words.`, 'codeUnderstandingSearch');
                return;
            }
            const formattedResults = {
                type: 'codeUnderstandingResults',
                title: 'Code Understanding Search',
                summary: `Found ${matchingCodeSnippets.length} code segments matching your description: "${query}"`,
                query: query,
                results: matchingCodeSnippets.slice(0, 10)
            };
            postToSidebar('Code Understanding Results', formattedResults, 'codeUnderstandingSearch');
        });
    }
    catch (err) {
        postToSidebar('Code Understanding Error', 'Failed to search for matching code: ' + String(err), 'codeUnderstandingSearch');
        console.error(err);
    }
}
function extractCodeSegments(content, language) {
    const segments = [];
    const lines = content.split('\n');
    try {
        if (['javascript', 'typescript'].includes(language)) {
            const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)|class\s+(\w+))/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const name = match[1] || match[2] || match[3];
                const startLine = content.substring(0, match.index).split('\n').length;
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
        if (segments.length === 0) {
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
function extractCodeBlock(content, startIndex, language) {
    try {
        const bracketLanguages = ['javascript', 'typescript', 'java', 'cpp', 'c', 'cs', 'php', 'go', 'rust'];
        const indentLanguages = ['python', 'ruby'];
        if (bracketLanguages.includes(language)) {
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
    return content.substring(startIndex, Math.min(startIndex + 500, content.length)).trim();
}
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
            console.warn('Raw response was:', response);
        }
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
function analyzeTextResponseForRelevance(response, query, code) {
    const responseLower = response.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
    const codeLower = code.toLowerCase();
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
async function handleSemanticSearchCommand(payload) {
    try {
        const query = payload?.query;
        if (!query?.trim()) {
            postToSidebar('Semantic Search', 'Please enter a search query.', 'semanticSearch');
            return;
        }
        await runWithProgress('Searching with AI...', async (progress) => {
            progress.report({ message: 'Analyzing your query...' });
            const searchResults = (0, search_1.searchIndex)(query, 20);
            if (searchResults.length === 0) {
                postToSidebar('Semantic Search', `No files found matching "${query}"`, 'semanticSearch');
                return;
            }
            const resultsWithContent = await Promise.all(searchResults.slice(0, 10).map(async (result) => {
                try {
                    const doc = await vscode.workspace.openTextDocument(result.filePath);
                    const content = doc.getText();
                    const functionNames = extractFunctionNames(content, doc.languageId);
                    const codeSnippet = extractRelevantCodeSnippet(content, query);
                    const lineNumber = findRelevantLineNumber(content, query);
                    return {
                        ...result,
                        functionName: functionNames[0] || result.fileName.replace(/\.[^/.]+$/, ''),
                        functionNames: functionNames,
                        codeSnippet: codeSnippet || content.substring(0, 200) + '...',
                        lineNumber: lineNumber,
                        fullContent: content.substring(0, 1000)
                    };
                }
                catch (err) {
                    console.warn(`Could not read file: ${result.filePath}`, err);
                    return {
                        ...result,
                        functionName: result.fileName.replace(/\.[^/.]+$/, ''),
                        functionNames: [],
                        codeSnippet: '// Could not read file content',
                        lineNumber: 1
                    };
                }
            }));
            const filesForAnalysis = resultsWithContent.map((result, index) => `File ${index + 1}: ${result.fileName}
Path: ${result.filePath}
Language: ${result.language}
Functions: ${result.functionNames.join(', ')}
Relevant Code:
\`\`\`${result.language}
${result.codeSnippet}
\`\`\``).join('\n\n');
            const prompt = `The user is searching for: "${query}"
      
Here are the file search results with code snippets. Please analyze which files are most relevant to the query and provide a semantic ranking:

${filesForAnalysis}

Please provide:
1. Which files are most relevant to the query and why (be specific about the code content)
2. Key functions, classes, or code sections that match the intent
3. Confidence scores for each file (0.1 to 1.0)
4. Any additional insights about how the code relates to the query

For each file, explain specifically what makes it relevant based on the actual code content.

Semantic Analysis:`;
            const aiResponse = await (0, callAI_1.callAI)(prompt);
            const confidenceScores = parseConfidenceScores(aiResponse, resultsWithContent);
            const formattedResults = {
                type: 'semanticSearchResults',
                title: 'AI Semantic Search',
                summary: `AI analyzed ${resultsWithContent.length} files for: "${query}"`,
                results: resultsWithContent.map((result, index) => ({
                    fileName: result.fileName,
                    filePath: result.filePath,
                    language: result.language,
                    lineCount: result.lineCount || 0,
                    confidence: confidenceScores[index] || (0.8 - (index * 0.05)),
                    codeSnippet: result.codeSnippet,
                    functionName: result.functionName,
                    functionNames: result.functionNames,
                    lineNumber: result.lineNumber
                })),
                analysis: aiResponse
            };
            postToSidebar('Semantic Search Results', formattedResults, 'semanticSearch');
        });
    }
    catch (err) {
        postToSidebar('Semantic Search Error', 'Failed to perform semantic search: ' + String(err), 'semanticSearch');
        console.error(err);
    }
}
function extractFunctionNames(content, language) {
    const functionNames = [];
    try {
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
    return functionNames.slice(0, 5);
}
function extractRelevantCodeSnippet(content, query) {
    try {
        const lines = content.split('\n');
        const queryTerms = query.toLowerCase().split(/\s+/);
        const relevantLines = [];
        lines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();
            if (queryTerms.some(term => term.length > 3 && lowerLine.includes(term))) {
                relevantLines.push(index);
            }
        });
        if (relevantLines.length > 0) {
            const firstLine = Math.max(0, relevantLines[0] - 3);
            const lastLine = Math.min(lines.length - 1, relevantLines[0] + 8);
            return lines.slice(firstLine, lastLine + 1).join('\n');
        }
        return lines.slice(0, 15).join('\n');
    }
    catch (err) {
        console.warn('Error extracting code snippet:', err);
        return content.substring(0, 200) + '...';
    }
}
function findRelevantLineNumber(content, query) {
    try {
        const lines = content.split('\n');
        const queryTerms = query.toLowerCase().split(/\s+/);
        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            if (queryTerms.some(term => term.length > 3 && lowerLine.includes(term))) {
                return i + 1;
            }
        }
        return 1;
    }
    catch (err) {
        return 1;
    }
}
function parseConfidenceScores(aiResponse, results) {
    const scores = new Array(results.length).fill(0.7);
    try {
        results.forEach((result, index) => {
            const fileName = result.fileName;
            const regex = new RegExp(`${fileName}.*?(\\d?\\.?\\d+)(?:/\\d+\\.\\d)?\\s*[Cc]onfidence`, 'i');
            const match = aiResponse.match(regex);
            if (match && match[1]) {
                scores[index] = Math.min(1.0, Math.max(0.1, parseFloat(match[1])));
            }
            else {
                scores[index] = 0.8 - (index * 0.05);
            }
        });
    }
    catch (err) {
        console.warn('Error parsing confidence scores:', err);
    }
    return scores;
}
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
    postToSidebar('Pattern Analysis', 'Pattern analysis is now integrated into the main chat. Try asking about specific patterns in your code.', 'patternAnalysis');
}
async function handleAnalyzeSearchResultsCommand() {
    postToSidebar('Search Analysis', 'Search analysis is now integrated into the main chat. Try asking questions about your codebase.', 'analyzeSearchResults');
}
async function handleSearchProjectCommand(payload) {
    try {
        const q = payload?.query || '';
        const results = (0, search_1.searchIndex)(q, 20);
        if (results.length === 0) {
            postToSidebar('Search Results', `No files found matching "${q}"`, 'searchProject');
            return;
        }
        const formattedResults = {
            type: 'fileList',
            title: 'Search Results',
            summary: `Found ${results.length} files matching "${q}"`,
            files: results.map((r) => ({
                fileName: r.fileName,
                filePath: r.filePath,
                language: r.language,
                lineCount: r.lineCount || 0
            }))
        };
        postToSidebar('Search Results', formattedResults, 'searchProject');
    }
    catch (err) {
        postToSidebar('Search Error', 'Search failed: ' + String(err), 'searchProject');
    }
}
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
function activate(context) {
    console.log('Activating VS Code AI Extension...');
    try {
        (0, search_1.initializeSearch)(context);
    }
    catch (e) {
        console.warn('initializeSearch error', e);
    }
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
        console.warn('Sidebar registration failed', e);
    }
    const regs = [
        vscode.commands.registerCommand('vs-code-ai-extension.chat', handleChatCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.explainCode', handleExplainCodeCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.findBugs', handleFindBugsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.suggestImprovements', handleSuggestImprovementsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.codeUnderstandingSearch', handleCodeUnderstandingSearchCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.semanticSearch', handleSemanticSearchCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.analyzeProject', handleAnalyzeEntireProjectCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.findBugsInProject', handleFindBugsInProjectCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.generateProjectSummary', handleGenerateProjectSummaryCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.askAI', handleAskAICommand),
        vscode.commands.registerCommand('vs-code-ai-extension.summarizeFile', handleSummarizeFileCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.smartExplain', handleSmartExplainCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.deepAnalysis', handleDeepAnalysisCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.patternAnalysis', handlePatternAnalysisCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.analyzeSearchResults', handleAnalyzeSearchResultsCommand),
        vscode.commands.registerCommand('vs-code-ai-extension.searchProject', handleSearchProjectCommand),
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
            }
            setTimeout(() => sidebarProvider?.refresh(), 400);
        }),
    ];
    regs.forEach((r) => context.subscriptions.push(r));
    setTimeout(() => {
        (0, search_1.buildSearchIndex)()
            .then((res) => {
            if (res && res.length > 0) {
                postToSidebar('Ready', `AI Assistant is ready! Indexed ${res.length} files. Ask me anything about your code!`, 'ready');
            }
        })
            .catch(() => { });
    }, 2000);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.fileName.includes('node_modules'))
            return;
        setTimeout(() => {
            (0, search_1.buildSearchIndex)().catch(() => { });
        }, 1000);
    }));
    console.log('VS Code AI Extension activated.');
}
function deactivate() {
    console.log('VS Code AI Extension deactivated.');
}
//# sourceMappingURL=extension.js.map