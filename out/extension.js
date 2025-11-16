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
exports.handleAskAICommand = handleAskAICommand;
exports.handleSummarizeFileCommand = handleSummarizeFileCommand;
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
const workflow_orchestrator_1 = require("./integration/workflow-orchestrator");
const sidebar_view_provider_1 = require("./webviews/sidebar-view-provider");
const refactor_manager_1 = require("./refactoring/refactor-manager");
let sidebarProvider;
let searchOutputChannel;
let aiFallbackChannel;
async function runWithProgress(title, task) {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
    }, task);
}
function postToSidebar(title, content) {
    const payload = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    if (sidebarProvider) {
        sidebarProvider.showAIAnalysis(title, payload);
    }
    else {
        if (!aiFallbackChannel)
            aiFallbackChannel = vscode.window.createOutputChannel('VS AI (fallback)');
        aiFallbackChannel.clear();
        aiFallbackChannel.appendLine(`🤖 ${title}`);
        aiFallbackChannel.appendLine('='.repeat(60));
        aiFallbackChannel.appendLine(payload);
        aiFallbackChannel.appendLine('='.repeat(60));
        aiFallbackChannel.show(true);
    }
}
async function handleAskAICommand(payload) {
    try {
        let code = payload?.code;
        if (!code) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.window.showWarningMessage('No active editor.');
                return;
            }
            const sel = editor.selection;
            code = sel.isEmpty
                ? editor.document.getText()
                : editor.document.getText(sel);
        }
        if (!code || !code.trim()) {
            await vscode.window.showWarningMessage('No code provided.');
            return;
        }
        const safeCode = code;
        await runWithProgress('Ask AI: explaining code...', async (progress) => {
            progress.report({ message: 'Calling AI...' });
            const prompt = `"""
Code:
${safeCode.substring(0, 2000)}

Detailed explanation of the code above:
"""
`;
            let response = await (0, callAI_1.callAI)(prompt);
            postToSidebar('Ask AI — Explanation', response);
            await vscode.window.showInformationMessage('Ask AI: result posted to sidebar.');
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Ask AI failed: ' + String(err));
        console.error(err);
    }
}
async function handleSummarizeFileCommand(payload) {
    try {
        let filePath = payload?.path;
        if (!filePath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.window.showWarningMessage('Open a file first.');
                return;
            }
            filePath = editor.document.uri.fsPath;
        }
        if (!filePath) {
            await vscode.window.showWarningMessage('No file path available.');
            return;
        }
        const safePath = filePath;
        const doc = await vscode.workspace.openTextDocument(safePath);
        const content = doc.getText();
        if (!content.trim()) {
            await vscode.window.showWarningMessage('File empty.');
            return;
        }
        await runWithProgress(`Summarizing ${safePath}...`, async (progress) => {
            progress.report({ message: 'Calling AI...' });
            const prompt = `"""
File Content:
${content.substring(0, 4000)}

Summary of the file (main functions, classes, and purpose):
"""
`;
            const response = await (0, callAI_1.callAI)(prompt);
            postToSidebar(`Summarize File — ${safePath.split(/[\\/]/).pop()}`, response);
            await vscode.window.showInformationMessage('File summary posted to sidebar.');
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Summarize failed: ' + String(err));
        console.error(err);
    }
}
async function handleSmartExplainCommand(payload) {
    try {
        let code = payload?.code;
        const useContext = payload?.useContext ?? true;
        if (!code) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.window.showWarningMessage('Open a file first.');
                return;
            }
            const sel = editor.selection;
            code = sel.isEmpty
                ? editor.document.getText()
                : editor.document.getText(sel);
        }
        if (!code || !code.trim()) {
            await vscode.window.showWarningMessage('No code provided.');
            return;
        }
        const safeCode = code;
        await runWithProgress('Smart Explain: collecting context...', async (progress) => {
            progress.report({ message: 'Running smart analysis...' });
            const result = await (0, workflow_orchestrator_1.smartCodeAnalysis)({
                selectedCode: safeCode,
                userQuery: 'Explain this code with context',
                useEnhancedContext: useContext,
                maxSearchResults: 6,
            });
            const r = result;
            const payload = {
                summary: result.response,
                success: result.success,
                contextUsed: r.contextUsed ?? [],
                metrics: r.metrics ?? null,
            };
            postToSidebar('Smart Explain', payload);
            await vscode.window.showInformationMessage('Smart Explain results posted to sidebar.');
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Smart Explain failed: ' + String(err));
        console.error(err);
    }
}
async function handleDeepAnalysisCommand(payload) {
    try {
        let code = payload?.code;
        if (!code) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                await vscode.window.showWarningMessage('Open a file first.');
                return;
            }
            const sel = editor.selection;
            code = sel.isEmpty
                ? editor.document.getText()
                : editor.document.getText(sel);
        }
        if (!code || !code.trim()) {
            await vscode.window.showWarningMessage('No code provided.');
            return;
        }
        const safeCode = code;
        await runWithProgress('Deep Analysis: running...', async (progress) => {
            progress.report({ message: 'Analyzing...' });
            const result = await (0, workflow_orchestrator_1.deepCodeAnalysis)(safeCode);
            const r = result;
            postToSidebar('Deep Analysis', {
                summary: result.response,
                issues: r.issues ?? [],
            });
            progress.report({ increment: 100 });
            await vscode.window.showInformationMessage('Deep Analysis posted to sidebar.');
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Deep Analysis failed: ' + String(err));
        console.error(err);
    }
}
async function handlePatternAnalysisCommand(payload) {
    try {
        let pattern = payload?.pattern;
        if (!pattern) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter code pattern to search for',
            });
            if (!input)
                return;
            pattern = input;
        }
        if (!pattern || !pattern.trim()) {
            await vscode.window.showWarningMessage('No pattern provided.');
            return;
        }
        const safePattern = pattern;
        await runWithProgress('Pattern Analysis: searching...', async (progress) => {
            progress.report({ message: 'Finding patterns...' });
            const result = await (0, workflow_orchestrator_1.patternAnalysis)(safePattern);
            postToSidebar('Pattern Analysis', result.response);
            progress.report({ increment: 100 });
            await vscode.window.showInformationMessage('Pattern Analysis posted to sidebar.');
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Pattern Analysis failed: ' + String(err));
        console.error(err);
    }
}
async function handleAnalyzeSearchResultsCommand(payload) {
    try {
        let q = payload?.query;
        if (!q) {
            q =
                (await vscode.window.showInputBox({
                    prompt: 'Enter search term to analyze with AI',
                })) || undefined;
        }
        if (!q)
            return;
        const safeQ = q;
        await runWithProgress(`Analyzing search results for "${safeQ}"...`, async (progress) => {
            progress.report({ message: 'Gathering results...' });
            const result = await (0, workflow_orchestrator_1.analyzeSearchResults)(safeQ, 8);
            const r = result;
            postToSidebar(`Analyze Search Results: ${safeQ}`, {
                summary: result.response,
                files: r.contextUsed ?? [],
            });
            progress.report({ increment: 100 });
            await vscode.window.showInformationMessage('Analyze Search Results posted to sidebar.');
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Analyze Search Results failed: ' + String(err));
        console.error(err);
    }
}
async function handleSearchProjectCommand(payload) {
    try {
        let q = payload?.query;
        if (!q) {
            q =
                (await vscode.window.showInputBox({
                    prompt: 'Enter search term',
                    placeHolder: 'function name, comment, etc.',
                })) || undefined;
        }
        if (q === undefined)
            return;
        const safeQ = q;
        await runWithProgress(`Searching project: ${safeQ}`, async (progress) => {
            progress.report({ message: 'Searching...' });
            const results = (0, search_1.searchIndex)(safeQ || '', 30);
            postToSidebar(`Search Project: ${safeQ}`, {
                summary: `Found ${results.length} files`,
                files: results.map((r) => ({
                    fileName: r.fileName,
                    filePath: r.filePath,
                    lineCount: r.lineCount,
                })),
            });
            await vscode.window.showInformationMessage(`Search posted to sidebar (${results.length} files).`);
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Search Project failed: ' + String(err));
        console.error(err);
    }
}
async function handleBuildSearchIndexCommand() {
    try {
        await runWithProgress('Building search index...', async (progress) => {
            progress.report({ message: 'Indexing...' });
            const results = await (0, search_1.buildSearchIndex)();
            postToSidebar('Build Search Index', { indexed: results.length });
            await vscode.window.showInformationMessage(`Indexed ${results.length} files`);
        });
    }
    catch (err) {
        await vscode.window.showErrorMessage('Build Search Index failed: ' + String(err));
        console.error(err);
    }
}
async function handleSearchStatsCommand() {
    try {
        const stats = (0, search_1.getSearchStats)();
        postToSidebar('Search Stats', stats);
        await vscode.window.showInformationMessage('Search statistics posted to sidebar.');
    }
    catch (err) {
        await vscode.window.showErrorMessage('Search Stats failed: ' + String(err));
        console.error(err);
    }
}
async function handleSearchByLanguageCommand(payload) {
    try {
        let lang = payload?.language;
        if (!lang) {
            const languages = [
                'typescript',
                'javascript',
                'python',
                'java',
                'css',
                'html',
                'markdown',
            ];
            lang =
                (await vscode.window.showQuickPick(languages, {
                    placeHolder: 'Select language',
                })) || undefined;
        }
        if (!lang)
            return;
        const safeLang = lang;
        const results = (0, search_1.searchByLanguage)(safeLang);
        postToSidebar(`Search by Language: ${safeLang}`, {
            files: results.map((r) => ({
                fileName: r.fileName,
                filePath: r.filePath,
                lineCount: r.lineCount,
            })),
        });
        await vscode.window.showInformationMessage(`Found ${results.length} ${safeLang} files`);
    }
    catch (err) {
        await vscode.window.showErrorMessage('Search by Language failed: ' + String(err));
        console.error(err);
    }
}
async function handleClearSearchIndexCommand() {
    try {
        const choice = await vscode.window.showWarningMessage('Clear search index? This will remove all indexed files.', { modal: true }, 'Yes, Clear Index');
        if (choice === 'Yes, Clear Index') {
            (0, search_1.clearSearchIndex)();
            postToSidebar('Clear Search Index', { cleared: true });
            await vscode.window.showInformationMessage('Search index cleared.');
        }
    }
    catch (err) {
        await vscode.window.showErrorMessage('Clear Search Index failed: ' + String(err));
        console.error(err);
    }
}
async function handleQuickFileSearchCommand() {
    try {
        const recent = (0, search_1.searchIndex)('', 20);
        if (recent.length === 0) {
            await vscode.window.showWarningMessage('No indexed files. Build index first.');
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
            await vscode.window.showInformationMessage(`Opened ${pick.label}`);
        }
    }
    catch (err) {
        await vscode.window.showErrorMessage('Quick File Search failed: ' + String(err));
        console.error(err);
    }
}
function activate(context) {
    console.log('Activating VS Code AI Extension...');
    aiFallbackChannel = vscode.window.createOutputChannel('VS AI (fallback)');
    try {
        const maybe = (0, search_1.initializeSearch)(context);
        if (maybe && typeof maybe.appendLine === 'function') {
            searchOutputChannel = maybe;
        }
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
        vscode.commands.registerCommand('vs-code-ai-extension.helloWorld', () => {
            vscode.window.showInformationMessage(`Hello World from VS AI at ${new Date().toLocaleString()}`);
        }),
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
                await vscode.commands.executeCommand('workbench.action.moveSideBarRight');
            }
            catch { }
            try {
                await vscode.commands.executeCommand('workbench.view.extension.vsCodeAI');
            }
            catch { }
            setTimeout(() => sidebarProvider?.refresh(), 400);
        }),
    ];
    regs.forEach((r) => context.subscriptions.push(r));
    setTimeout(() => {
        (0, search_1.buildSearchIndex)()
            .then((res) => {
            if (res && res.length > 0)
                postToSidebar('Search Index', { filesIndexed: res.length });
        })
            .catch(() => { });
    }, 3000);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.fileName.includes('node_modules'))
            return;
        setTimeout(() => {
            (0, search_1.buildSearchIndex)().catch(() => { });
        }, 1000);
    }));
    try {
        vscode.commands.executeCommand('workbench.action.moveSideBarRight');
    }
    catch { }
    console.log('VS Code AI Extension activated.');
}
function deactivate() {
    console.log('VS Code AI Extension deactivated.');
}
//# sourceMappingURL=extension.js.map