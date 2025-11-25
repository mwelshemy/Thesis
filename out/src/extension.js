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
exports.handleSemanticSearchCommand = handleSemanticSearchCommand;
exports.setSidebarProvider = setSidebarProvider;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const callAI_1 = require("./ai/callAI");
const search_1 = require("./search");
const logger_1 = require("./logger");
const debug_search_command_1 = require("./debug/debug-search-command");
const code_utils_1 = require("./code-utils");
let sidebarProvider;
async function runWithProgress(title, task) {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
    }, (progress) => task(progress));
}
function postToSidebar(title, content, action) {
    (0, logger_1.logInfo)(`📤 [SIDEBAR_POST] Posting to sidebar - Title: ${title}, Action: ${action}`);
    if (sidebarProvider) {
        sidebarProvider.showAIAnalysis(title, content, action);
    }
    else {
        (0, logger_1.logWarn)('❌ [SIDEBAR_POST] Sidebar provider not available');
    }
}
function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
async function resilientCallAI(prompt, retries = 3, initialBackoffMs = 500) {
    const overallStart = Date.now();
    let attempt = 0;
    let lastErr = null;
    try {
        const healthy = await (0, callAI_1.checkAIHealth)();
        if (!healthy) {
            (0, logger_1.logWarn)('🧭 [AI_HEALTH] AI server indicates not healthy. Will still attempt call.');
        }
        else {
            (0, logger_1.logInfo)('🧭 [AI_HEALTH] AI health: healthy');
        }
    }
    catch (e) {
        (0, logger_1.logWarn)(`🧭 [AI_HEALTH] Health check failed: ${String(e)}`);
    }
    for (attempt = 1; attempt <= retries; attempt++) {
        const attemptStart = Date.now();
        try {
            (0, logger_1.logDebug)(`🕵️‍♂️ [AI_CALL] Attempt ${attempt}/${retries} - sending prompt preview: ${prompt?.substring(0, 200).replace(/\n/g, ' ')}`);
            const text = await (0, callAI_1.callAI)(prompt);
            const attemptElapsed = Date.now() - attemptStart;
            const overallElapsed = Date.now() - overallStart;
            const lower = (text || '').toLowerCase();
            const isMock = lower.startsWith('mock response') ||
                lower.includes('note: this is a mock response') ||
                lower.includes('mock response:') ||
                lower.includes('mock_mode') ||
                lower.includes('model not ready') ||
                lower.includes('model is not ready');
            const looksLikeError = lower.startsWith('error:') ||
                lower.includes('connection refused') ||
                lower.includes('request timeout') ||
                lower.includes('stacktrace') ||
                lower.includes('exception');
            if (looksLikeError) {
                throw new Error(`AI call returned error-like response: ${text?.substring?.(0, 200) ?? text}`);
            }
            if (isMock && attempt < retries) {
                const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
                (0, logger_1.logWarn)(`🕵️‍♂️ [AI_CALL] Received mock response on attempt ${attempt}. Backing off ${backoff}ms and retrying.`);
                await sleep(backoff);
                continue;
            }
            (0, logger_1.logInfo)(`🕵️‍♂️ [AI_CALL] Success on attempt ${attempt} (attemptElapsed=${attemptElapsed}ms overallElapsed=${overallElapsed}ms) isMock=${isMock}`);
            return { text: text ?? '', elapsedMs: overallElapsed, isMock, attempts: attempt };
        }
        catch (err) {
            lastErr = err;
            const errMsg = String(err || '').toLowerCase();
            (0, logger_1.logWarn)(`🕵️‍♂️ [AI_CALL] Attempt ${attempt} failed: ${errMsg}`);
            if (attempt < retries) {
                const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
                (0, logger_1.logInfo)(`🕵️‍♂️ [AI_CALL] Retrying in ${backoff}ms...`);
                await sleep(backoff);
                continue;
            }
            else {
                const overallElapsed = Date.now() - overallStart;
                const errorText = (err && err.code === 'ECONNREFUSED')
                    ? 'ERROR: Connection refused. Is the AI server running?'
                    : `ERROR: ${String(err)}`;
                (0, logger_1.logErr)(`🕵️‍♂️ [AI_CALL] All attempts failed: ${String(err)}`);
                return { text: errorText, elapsedMs: overallElapsed, isMock: true, attempts: attempt };
            }
        }
    }
    const overallElapsed = Date.now() - overallStart;
    return { text: `ERROR: Unknown failure after ${attempt - 1} attempts`, elapsedMs: overallElapsed, isMock: true, attempts: attempt - 1 };
}
async function getAllProjectFiles() {
    try {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage('No workspace folder open.');
            return [];
        }
        const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        (0, logger_1.logInfo)(`📁 [FILE_ACCESS] Found ${files.length} project files`);
        return files;
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [FILE_ACCESS] Error getting project files: ${String(err)}`);
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
        const aiRes = await resilientCallAI(prompt);
        if (aiRes.isMock) {
            (0, logger_1.logWarn)(`❗ [BUG_ANALYSIS] AI returned mock/error after ${aiRes.attempts} attempts (elapsed ${aiRes.elapsedMs}ms).`);
            const text = aiRes.text || '';
            if (text && !text.toLowerCase().includes('no critical issues')) {
                return `## ${filename}\n\n${text}\n\n(Note: AI response may be mock/error)`;
            }
            return null;
        }
        const response = aiRes.text;
        if (response && !response.toLowerCase().includes('no critical issues') && !response.toLowerCase().includes('no significant issues')) {
            return `## ${filename}\n\n${response}`;
        }
        return null;
    }
    catch (err) {
        (0, logger_1.logWarn)(`❌ [BUG_ANALYSIS] Failed to analyze ${filename} for bugs: ${String(err)}`);
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
function generateIdentifierVariants(phrase) {
    if (!phrase)
        return [];
    const parts = phrase.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    if (parts.length === 0)
        return [];
    if (parts.length === 1) {
        const word = parts[0];
        return [word, word + 's', word + 'ing', word + 'ed'];
    }
    const joined = parts.join('');
    const snake = parts.join('_');
    const kebab = parts.join('-');
    const camel = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const commonVariants = [
        phrase.toLowerCase(),
        ...parts,
        joined, snake, camel, pascal, kebab,
        joined + 's', snake + 's', camel + 's',
        'get' + pascal, 'find' + pascal, 'create' + pascal,
        'do' + pascal, 'run' + pascal, 'execute' + pascal
    ];
    return Array.from(new Set(commonVariants)).filter(v => v && v.length > 1);
}
async function findMatchingCodeSections(query, codeSections) {
    const matches = [];
    try {
        const batchSize = 8;
        for (let i = 0; i < codeSections.length; i += batchSize) {
            const batch = codeSections.slice(i, i + batchSize);
            const prompt = `The user is looking for code that: "${query}"

I will show you several code sections. For each one, determine if it matches what the user is looking for.

Respond with a JSON array where each item has:
- "index": the section index (0-based)
- "relevant": true|false
- "confidence": 0.0 to 1.0
- "explanation": brief explanation of why it matches or doesn't match

Code sections to evaluate:

${batch
                .map((section, index) => `
--- Section ${index} ---
File: ${section.fileName}
Type: ${section.sectionType}
Name: ${section.sectionName}
Language: ${section.language}
Code:
\`\`\`${section.language}
${(section.code || '').substring(0, 800)}
\`\`\`
`)
                .join('\n')}

Respond with JSON only:
[{"index":0,"relevant":true,"confidence":0.85,"explanation":"..."}, ...]`;
            const aiRes = await resilientCallAI(prompt, 2, 500);
            if (!aiRes.isMock && aiRes.text) {
                try {
                    const jsonMatch = aiRes.text.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        const evaluations = JSON.parse(jsonMatch[0]);
                        evaluations.forEach((evaluation) => {
                            if (evaluation.relevant && evaluation.confidence > 0.3) {
                                const section = batch[evaluation.index];
                                if (section) {
                                    matches.push({
                                        ...section,
                                        confidence: Math.min(1, Number(evaluation.confidence || 0)),
                                        explanation: evaluation.explanation || 'Matches query'
                                    });
                                }
                            }
                        });
                    }
                    else {
                        const fallbackMatches = applyFallbackMatching(query, batch);
                        matches.push(...fallbackMatches);
                    }
                }
                catch (parseErr) {
                    console.warn('❌ [MATCHING] Failed to parse AI evaluation:', parseErr);
                    const fallbackMatches = applyFallbackMatching(query, batch);
                    matches.push(...fallbackMatches);
                }
            }
            else {
                const fallbackMatches = applyFallbackMatching(query, batch);
                matches.push(...fallbackMatches);
            }
            await sleep(200);
        }
        matches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }
    catch (err) {
        console.error('❌ [MATCHING] Error finding matching sections:', err);
    }
    return matches.slice(0, 12);
}
function applyFallbackMatching(query, batch) {
    const matches = [];
    const queryLower = (query || '').toLowerCase();
    const queryTokens = queryLower.split(/\W+/).filter(token => token.length > 2);
    batch.forEach((section) => {
        const sectionText = ((section.sectionName || '') + ' ' + (section.code || '')).toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
            if (sectionText.includes(token))
                score += 0.2;
        }
        if (section.sectionType === 'function' || section.sectionType === 'class') {
            const nameLower = (section.sectionName || '').toLowerCase();
            if (queryTokens.some(token => nameLower.includes(token)))
                score += 0.3;
        }
        if ((section.code || '').length < 1000)
            score += 0.05;
        if (score > 0.3) {
            matches.push({
                ...section,
                confidence: Math.min(0.9, score),
                explanation: `Matches keywords from your query: "${query}"`
            });
        }
    });
    return matches;
}
async function directPhraseSearchInFiles(phrase, files, maxResults = 12) {
    const variants = generateIdentifierVariants(phrase);
    (0, logger_1.logDebug)(`🔍 [DIRECT_SEARCH] Searching for variants: ${variants.join(', ')}`);
    const results = [];
    const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
    const searchedFiles = new Set();
    for (const file of files) {
        if (results.length >= maxResults)
            break;
        try {
            const ext = file.fsPath.split('.').pop() || '';
            if (!sourceExtensions.includes(ext))
                continue;
            const doc = await vscode.workspace.openTextDocument(file);
            const content = doc.getText();
            const contentLower = content.toLowerCase();
            searchedFiles.add(file.fsPath);
            let bestVariant;
            let bestScore = 0;
            for (const v of variants) {
                if (!v || v.length < 2)
                    continue;
                let score = 0;
                const index = contentLower.indexOf(v);
                if (index !== -1) {
                    score = 1.0;
                    score += Math.min(0.5, v.length / 20);
                    const surrounding = content.substring(Math.max(0, index - 20), Math.min(content.length, index + 20));
                    if (surrounding.includes('function') || surrounding.includes('class') || surrounding.includes('def ')) {
                        score += 0.3;
                    }
                    if (score > bestScore) {
                        bestScore = score;
                        bestVariant = v;
                    }
                }
            }
            if (bestVariant && bestScore > 0) {
                const foundIndex = contentLower.indexOf(bestVariant);
                const snippet = (0, code_utils_1.extractCodeBlock)(content, foundIndex, doc.languageId) ||
                    content.substring(Math.max(0, foundIndex - 120), Math.min(content.length, foundIndex + 400));
                const lineNumber = content.substring(0, foundIndex).split('\n').length;
                results.push({
                    filePath: file.fsPath,
                    fileName: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                    language: doc.languageId,
                    codeSnippet: snippet,
                    functionName: extractFunctionName(content, foundIndex, doc.languageId),
                    lineNumber,
                    relevanceScore: Math.min(1.0, bestScore * 0.8),
                    explanation: `Match for "${bestVariant}" (score: ${bestScore.toFixed(2)})`
                });
            }
        }
        catch (err) {
            (0, logger_1.logWarn)(`directPhraseSearchInFiles error for ${file.fsPath}: ${String(err)}`);
        }
    }
    if (results.length === 0) {
        (0, logger_1.logDebug)('🔍 [DIRECT_SEARCH] No direct matches found, returning relevant files');
        const concepts = (0, code_utils_1.extractConcepts)(phrase.toLowerCase());
        const primaryConcept = concepts.length > 0 ? concepts[0] : '';
        for (const file of files.slice(0, Math.min(8, files.length))) {
            if (results.length >= maxResults)
                break;
            try {
                const ext = file.fsPath.split('.').pop() || '';
                if (!sourceExtensions.includes(ext))
                    continue;
                if (searchedFiles.has(file.fsPath))
                    continue;
                const doc = await vscode.workspace.openTextDocument(file);
                const content = doc.getText();
                let relevanceScore = 0.3;
                const functionCount = (content.match(/function\s+\w+|def\s+\w+|class\s+\w+/g) || []).length;
                relevanceScore += Math.min(0.3, functionCount * 0.1);
                if (primaryConcept && content.toLowerCase().includes(primaryConcept)) {
                    relevanceScore += 0.2;
                }
                if (content.length < 1000) {
                    relevanceScore += 0.1;
                }
                const snippet = (0, code_utils_1.extractCodeBlock)(content, 0, doc.languageId) ||
                    content.substring(0, Math.min(300, content.length));
                results.push({
                    filePath: file.fsPath,
                    fileName: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                    language: doc.languageId,
                    codeSnippet: snippet,
                    functionName: extractFunctionName(content, 0, doc.languageId),
                    lineNumber: 1,
                    relevanceScore: Math.min(0.8, relevanceScore),
                    explanation: `Relevant file${primaryConcept ? ` (contains ${primaryConcept})` : ''}`
                });
            }
            catch (err) {
                (0, logger_1.logWarn)(`Fallback search error for ${file.fsPath}: ${String(err)}`);
            }
        }
    }
    (0, logger_1.logDebug)(`🔍 [DIRECT_SEARCH] Found ${results.length} results`);
    return results;
}
function extractFunctionName(content, index, language) {
    const before = content.substring(Math.max(0, index - 200), index);
    if (['javascript', 'typescript'].includes(language)) {
        const functionMatch = before.match(/(?:function|class)\s+(\w+)\s*[{(]/);
        if (functionMatch)
            return functionMatch[1];
        const constMatch = before.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\()/);
        if (constMatch)
            return constMatch[1];
    }
    if (language === 'python') {
        const defMatch = before.match(/def\s+(\w+)\s*\(/);
        if (defMatch)
            return defMatch[1];
        const classMatch = before.match(/class\s+(\w+)\s*\(?/);
        if (classMatch)
            return classMatch[1];
    }
    return undefined;
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
                    (0, logger_1.logWarn)(`❌ [PROJECT_ANALYSIS] Could not read file: ${file.fsPath} - ${String(err)}`);
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
            const aiRes = await resilientCallAI(prompt, 3, 800);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for project analysis. Start AI server/models for full analysis.');
            }
            const fullAnalysis = `## Complete Project Analysis\n\n**Files Scanned:** ${filesProcessed} of ${files.length} total files\n\n${aiRes.text}`;
            postToSidebar('Complete Project Analysis', fullAnalysis, 'analyzeProject');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [PROJECT_ANALYSIS] Error: ${String(err)}`);
        postToSidebar('Project Analysis Error', 'Failed to analyze project: ' + String(err), 'analyzeProject');
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
                    (0, logger_1.logWarn)(`❌ [BUG_SCAN] Could not analyze file: ${file.fsPath} - ${String(err)}`);
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
        (0, logger_1.logErr)(`❌ [BUG_SCAN] Error: ${String(err)}`);
        postToSidebar('Bug Scan Error', 'Failed to scan project for bugs: ' + String(err), 'findBugsInProject');
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
            const aiRes = await resilientCallAI(prompt, 3, 800);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for project summary. Start AI server/models for full results.');
            }
            const fullReport = `## Project Overview\n\n**File Statistics:**\n- Total Files: ${fileStats.total}\n- Languages: ${JSON.stringify(fileStats.byLanguage)}\n- Extensions: ${JSON.stringify(fileStats.byExtension)}\n- Key Files Analyzed: ${filesRead}\n\n${aiRes.text}`;
            postToSidebar('Project Summary', fullReport, 'generateProjectSummary');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [PROJECT_SUMMARY] Error: ${String(err)}`);
        postToSidebar('Summary Error', 'Failed to generate project summary: ' + String(err), 'generateProjectSummary');
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
            const aiRes = await resilientCallAI(prompt, 3, 500);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for chat. Start AI server/models for full responses.');
            }
            postToSidebar('Chat Response', aiRes.text, 'chat');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [CHAT] Error: ${String(err)}`);
        postToSidebar('Chat Error', 'Failed to process your message: ' + String(err), 'chat');
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
            const aiRes = await resilientCallAI(prompt);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for explanation. Start AI server/models for full explanations.');
            }
            postToSidebar('Code Explanation', aiRes.text, 'explainCode');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [EXPLAIN_CODE] Error: ${String(err)}`);
        postToSidebar('Explanation Error', 'Failed to explain code: ' + String(err), 'explainCode');
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
            const aiRes = await resilientCallAI(prompt);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for file summary. Start AI server/models for full summaries.');
            }
            postToSidebar(`File Summary - ${safePath.split(/[\\/]/).pop()}`, aiRes.text, 'summarizeFile');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [SUMMARIZE_FILE] Error: ${String(err)}`);
        postToSidebar('Summary Error', 'Failed to summarize file: ' + String(err), 'summarizeFile');
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
            const aiRes = await resilientCallAI(prompt);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for bug analysis. Start AI server/models for full results.');
            }
            postToSidebar('Code Issues Analysis', aiRes.text, 'findBugs');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [FIND_BUGS] Error: ${String(err)}`);
        postToSidebar('Bug Analysis Error', 'Failed to analyze code for issues: ' + String(err), 'findBugs');
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
            const aiRes = await resilientCallAI(prompt);
            if (aiRes.isMock) {
                vscode.window.showWarningMessage('AI returned a mock/error for improvement suggestions. Start AI server/models for full results.');
            }
            postToSidebar('Code Improvement Suggestions', aiRes.text, 'suggestImprovements');
        });
    }
    catch (err) {
        (0, logger_1.logErr)(`❌ [SUGGEST_IMPROVEMENTS] Error: ${String(err)}`);
        postToSidebar('Improvement Error', 'Failed to suggest improvements: ' + String(err), 'suggestImprovements');
    }
}
async function handleSemanticSearchCommand(payload) {
    const dbg = (0, logger_1.getDebugChannel)();
    dbg.show(true);
    dbg.appendLine(`🔍 [DEBUG] handleSemanticSearchCommand invoked with payload: ${JSON.stringify(payload)}`);
    try {
        const query = payload?.query;
        if (!query?.trim()) {
            dbg.appendLine('🔍 [DEBUG] Empty query provided, aborting search.');
            postToSidebar('Semantic Search', 'Please describe what code you\'re looking for.', 'semanticSearch');
            return;
        }
        dbg.appendLine(`🔍 [DEBUG] Query: "${query}"`);
        await runWithProgress('Finding matching code...', async (progress) => {
            progress.report({ message: 'Analyzing your description...' });
            const allFiles = await getAllProjectFiles();
            dbg.appendLine(`🔍 [DEBUG] Found ${allFiles.length} total workspace files`);
            if (allFiles.length === 0) {
                dbg.appendLine(`🔍 [DEBUG] No files found for query "${query}"`);
                postToSidebar('Semantic Search', `No files found matching "${query}"`, 'semanticSearch');
                return;
            }
            const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
            const sourceFiles = allFiles.filter(f => sourceExtensions.includes((f.fsPath.split('.').pop() || '').toLowerCase()));
            dbg.appendLine(`🔍 [DEBUG] ${sourceFiles.length} source files after filtering`);
            if (sourceFiles.length === 0) {
                dbg.appendLine(`🔍 [DEBUG] No source files found`);
                postToSidebar('Semantic Search', `No source code files found in project`, 'semanticSearch');
                return;
            }
            progress.report({ message: 'Extracting functions and code sections...' });
            const codeSections = [];
            const batchSize = 10;
            for (let i = 0; i < sourceFiles.length; i += batchSize) {
                const batch = sourceFiles.slice(i, i + batchSize);
                for (const file of batch) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(file);
                        const content = doc.getText();
                        const language = doc.languageId || getLanguageFromExtension(file.fsPath.split('.').pop() || '');
                        const sections = (0, code_utils_1.extractCodeSections)(content, language);
                        sections.forEach(section => {
                            codeSections.push({
                                filePath: file.fsPath,
                                fileName: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                                language,
                                sectionType: section.type,
                                sectionName: section.name,
                                code: section.code,
                                lineNumber: section.lineNumber
                            });
                        });
                        dbg.appendLine(`   📄 Extracted ${sections.length} sections from ${file.fsPath}`);
                    }
                    catch (err) {
                        dbg.appendLine(`   ❌ Error processing ${file.fsPath}: ${String(err)}`);
                    }
                }
                progress.report({
                    message: `Processed ${Math.min(i + batchSize, sourceFiles.length)}/${sourceFiles.length} files...`,
                    increment: (batchSize / sourceFiles.length) * 100
                });
            }
            dbg.appendLine(`🔍 [DEBUG] Extracted ${codeSections.length} total code sections`);
            if (codeSections.length === 0) {
                dbg.appendLine(`🔍 [DEBUG] No code sections extracted`);
                postToSidebar('Semantic Search', 'No functions or code sections found in project files.', 'semanticSearch');
                return;
            }
            progress.report({ message: 'Finding matches using AI/embeddings...' });
            try {
                dbg.appendLine('🔬 [DEBUG] Attempting embedding-based search as a first pass');
                const embeddingMatches = await (0, search_1.semanticSearch)(query, 12);
                if (embeddingMatches && embeddingMatches.length > 0) {
                    dbg.appendLine(`🔬 [DEBUG] Embedding search returned ${embeddingMatches.length} results`);
                    const mapped = embeddingMatches.map((m) => ({
                        filePath: m.filePath,
                        fileName: m.filePath.split(/[\\/]/).pop() || m.filePath,
                        language: (m.language || '').toLowerCase(),
                        sectionType: m.sectionType || 'function',
                        sectionName: m.functionName || m.sectionName || 'code block',
                        code: (m.code || m.snippet || m.text || '').substring(0, 1200),
                        lineNumber: m.startLine || m.lineNumber || 1,
                        confidence: m.score || m.similarity || m.confidence || 0.6,
                        explanation: m.explanation || 'Embedding similarity match'
                    }));
                    const formattedResults = {
                        type: 'codeUnderstandingResults',
                        title: `Embedding Semantic Results for: "${query}"`,
                        summary: `Found ${mapped.length} code sections using embeddings for "${query}"`,
                        query: query,
                        intent: {
                            searchType: 'function',
                            language: 'any',
                            concepts: [query],
                            isFunctionSearch: true,
                            isClassSearch: false,
                            isPatternSearch: false
                        },
                        results: mapped.slice(0, 12)
                    };
                    postToSidebar('Natural Language Search Results', formattedResults, 'semanticSearch');
                    dbg.appendLine('🔚 [DEBUG] Returning embedding-based results');
                    return;
                }
                else {
                    dbg.appendLine('🔬 [DEBUG] Embedding search returned no results (vector store may be empty)');
                }
            }
            catch (err) {
                dbg.appendLine(`⚠️ [DEBUG] Embedding-based search errored: ${String(err)}`);
            }
            const matchingSections = await findMatchingCodeSections(query, codeSections);
            dbg.appendLine(`🔍 [DEBUG] Found ${matchingSections.length} matching sections`);
            if (matchingSections.length === 0) {
                dbg.appendLine(`🔍 [DEBUG] No AI matches, trying fallback search`);
                const fallbackResults = await directPhraseSearchInFiles(query, sourceFiles.slice(0, 20), 8);
                const fallbackMatches = fallbackResults.map(result => ({
                    filePath: result.filePath,
                    fileName: result.fileName,
                    language: result.language,
                    sectionType: 'function',
                    sectionName: result.functionName || 'code block',
                    code: result.codeSnippet,
                    lineNumber: result.lineNumber,
                    confidence: result.relevanceScore,
                    explanation: result.explanation
                }));
                if (fallbackMatches.length > 0) {
                    dbg.appendLine(`🔍 [DEBUG] Fallback found ${fallbackMatches.length} results`);
                    matchingSections.push(...fallbackMatches);
                }
            }
            const formattedResults = {
                type: 'codeUnderstandingResults',
                title: `Code Search Results for: "${query}"`,
                summary: matchingSections.length > 0
                    ? `Found ${matchingSections.length} code sections matching your description`
                    : `No exact matches found for "${query}". Try describing the functionality in different words.`,
                query: query,
                intent: {
                    searchType: 'function',
                    language: 'any',
                    concepts: [query],
                    isFunctionSearch: true,
                    isClassSearch: false,
                    isPatternSearch: false
                },
                results: matchingSections.map((section) => ({
                    filePath: section.filePath,
                    fileName: section.fileName,
                    language: section.language,
                    codeSnippet: section.code,
                    functionName: section.sectionName,
                    lineNumber: section.lineNumber,
                    relevanceScore: section.confidence || 0.5,
                    explanation: section.explanation || `Matches your description: "${query}"`
                }))
            };
            dbg.appendLine(`🔍 [DEBUG] Sending ${formattedResults.results.length} results to sidebar`);
            postToSidebar('Natural Language Search Results', formattedResults, 'semanticSearch');
        });
    }
    catch (err) {
        const dbg = (0, logger_1.getDebugChannel)();
        dbg.appendLine(`🔍 [DEBUG] Error in handleSemanticSearchCommand: ${String(err)}`);
        (0, logger_1.logErr)(`❌ [SEMANTIC_SEARCH] Error: ${String(err)}`);
        postToSidebar('Semantic Search Error', 'Failed to search for code: ' + String(err), 'semanticSearch');
    }
}
function setSidebarProvider(provider) {
    sidebarProvider = provider;
}
function activate(context) {
    context.subscriptions.push((0, logger_1.getDebugChannel)());
    try {
        (0, debug_search_command_1.registerDebugSearchCommand)(context);
        (0, logger_1.logInfo)('✅ Debug search command registered: vs-code-ai-extension.debugSearch');
    }
    catch (err) {
        (0, logger_1.logWarn)(`Unable to register debug search command: ${String(err)}`);
    }
    try {
        (0, search_1.initializeSearch)(context);
        (0, logger_1.logInfo)('✅ Search functionality initialized');
    }
    catch (e) {
        (0, logger_1.logWarn)(`Search initialization failed during activation: ${String(e)}`);
    }
}
function deactivate() {
}
//# sourceMappingURL=extension.js.map