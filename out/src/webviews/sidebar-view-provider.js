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
exports.SidebarViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class SidebarViewProvider {
    constructor(_extensionUri, refactorManager) {
        this._extensionUri = _extensionUri;
        this.refactorManager = refactorManager;
        this._pending = [];
        this._disposables = [];
        this._projectFiles = [];
        try {
            const onDidChangeFiles = this.refactorManager?.onDidChangeFiles;
            if (typeof onDidChangeFiles === 'function') {
                const disp = onDidChangeFiles.call(this.refactorManager, () => this.refresh());
                if (disp && typeof disp.dispose === 'function') {
                    this._refactorChangeDisposable = disp;
                    this._disposables.push(disp);
                }
            }
        }
        catch (err) {
            console.error('RefactorManager subscription failed', err);
        }
        this._loadProjectFiles();
    }
    async _loadProjectFiles() {
        try {
            if (!vscode.workspace.workspaceFolders) {
                return;
            }
            const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*');
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
            this._projectFiles = files.map(file => ({
                label: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                path: file.fsPath,
                description: file.fsPath
            })).slice(0, 100);
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'projectFiles',
                    files: this._projectFiles
                });
            }
        }
        catch (err) {
            console.error('Error loading project files:', err);
        }
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.show?.(true);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, 'resources'),
                vscode.Uri.joinPath(this._extensionUri, 'src', 'webviews')
            ],
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        const messageDisp = webviewView.webview.onDidReceiveMessage(async (msg) => {
            try {
                if (msg.command === 'refresh') {
                    this.refresh();
                    return;
                }
                if (msg.command === 'clearChat') {
                    this._view?.webview.postMessage({ type: 'clearChat' });
                    return;
                }
                if (msg.command === 'openFile') {
                    await this._openFile(msg.path);
                    return;
                }
                if (msg.command === 'openFileAtLine') {
                    await this._openFileAtLine(msg.path, msg.line);
                    return;
                }
                if (msg.command === 'executeCommand') {
                    await vscode.commands.executeCommand(msg.cmd, ...(msg.args || []));
                    return;
                }
                if (msg.command === 'requestPreview') {
                    await this._handleRequestPreview(msg.path);
                    return;
                }
                if (msg.command === 'preview') {
                    await this._openDiffPanel(msg.path);
                    return;
                }
                if (msg.command === 'apply') {
                    await this._applyChanges(msg.path);
                    return;
                }
                if (msg.command === 'analyzeProject') {
                    const scope = msg.scope || 'full';
                    switch (scope) {
                        case 'full':
                            await vscode.commands.executeCommand('vs-code-ai-extension.analyzeProject');
                            break;
                        case 'bugs':
                            await vscode.commands.executeCommand('vs-code-ai-extension.findBugsInProject');
                            break;
                        case 'summary':
                            await vscode.commands.executeCommand('vs-code-ai-extension.generateProjectSummary');
                            break;
                    }
                    return;
                }
                if (msg.command === 'getProjectFiles') {
                    this._view?.webview.postMessage({
                        type: 'projectFiles',
                        files: this._projectFiles
                    });
                    return;
                }
                if (msg.command === 'run') {
                    const action = msg.action || '';
                    const payload = msg.payload;
                    if (action === 'requestPreview') {
                        await this._handleRequestPreview(payload?.path);
                        return;
                    }
                    if (action === 'preview') {
                        await this._openDiffPanel(payload?.path);
                        return;
                    }
                    if (action === 'apply') {
                        await this._applyChanges(payload?.path);
                        return;
                    }
                    try {
                        await vscode.commands.executeCommand(`vs-code-ai-extension.${action}`, payload);
                    }
                    catch (e) {
                        const errorMessage = String(e?.message || '');
                        if (e && errorMessage && /not found/.test(errorMessage)) {
                            this.showAIAnalysis('Command not found', `The command vs-code-ai-extension.${action} is not registered.`, action);
                        }
                        else if (e && (e.name === 'Canceled' || /canceled/i.test(errorMessage))) {
                            this.showAIAnalysis('Cancelled', `Operation "${action}" was cancelled.`, action);
                        }
                        else {
                            this.showAIAnalysis('Error', `Failed to run ${action}: ${String(e)}`, action);
                        }
                    }
                    return;
                }
            }
            catch (err) {
                console.error('Message handler error', err);
            }
        });
        this._disposables.push(messageDisp);
        for (const p of this._pending) {
            this._post({
                type: 'aiOutput',
                title: p.title,
                content: p.content,
                source: 'command',
                contentType: typeof p.content === 'object' ? 'object' : 'string',
                action: p.action || ''
            });
        }
        this._pending = [];
        this.refresh();
        this._view.webview.postMessage({
            type: 'projectFiles',
            files: this._projectFiles
        });
        vscode.workspace.onDidSaveTextDocument(() => {
            setTimeout(() => this._loadProjectFiles(), 1000);
        }, null, this._disposables);
    }
    async _openFile(filePath) {
        try {
            if (filePath === 'project') {
                return;
            }
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
    }
    async _openFileAtLine(filePath, lineNumber) {
        try {
            if (filePath === 'project') {
                return;
            }
            const doc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(doc);
            // Reveal the line and set cursor position
            const position = new vscode.Position(lineNumber - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to open file at line: ${filePath}:${lineNumber}`);
        }
    }
    refresh() {
        if (!this._view)
            return;
        try {
            const files = this.refactorManager &&
                typeof this.refactorManager.getModifiedFiles === 'function'
                ? this.refactorManager.getModifiedFiles()
                : [];
            this._view.webview.postMessage({ type: 'updateFiles', value: files });
        }
        catch (err) {
            console.error('refresh error', err);
            try {
                this._view.webview.postMessage({ type: 'updateFiles', value: [] });
            }
            catch (e) {
                console.error('failed to post fallback updateFiles', e);
            }
        }
    }
    showAIAnalysis(title, content, action) {
        const msg = {
            type: 'aiOutput',
            title,
            content,
            source: 'command',
            contentType: typeof content === 'object' ? 'object' : 'string',
            action: action || ''
        };
        if (!this._view) {
            this._pending.push({ title, content, action });
            return;
        }
        this._post(msg);
    }
    _post(message) {
        try {
            this._view?.webview.postMessage(message);
        }
        catch (err) {
            console.error('post to webview failed', err);
            if (message && message.type === 'aiOutput' && message.title && message.content) {
                this._pending.push({
                    title: message.title,
                    content: message.content,
                    action: message.action
                });
            }
        }
    }
    async _handleRequestPreview(path) {
        try {
            let targetPath = path;
            if (!targetPath) {
                const active = vscode.window.activeTextEditor;
                if (active && active.document && active.document.uri) {
                    targetPath = active.document.uri.fsPath;
                }
            }
            const modified = this.refactorManager?.getFileContent(targetPath || '') ?? '';
            let original = '';
            try {
                if (targetPath) {
                    const doc = await vscode.workspace.openTextDocument(targetPath);
                    original = doc.getText();
                }
                else {
                    original = '// original not available';
                }
            }
            catch {
                original = '// original not available';
            }
            this._post({ type: 'previewData', path: targetPath, original, modified });
        }
        catch (err) {
            console.error('requestPreview failed', err);
        }
    }
    async _openDiffPanel(path) {
        try {
            let targetPath = path;
            if (!targetPath) {
                const active = vscode.window.activeTextEditor;
                if (active && active.document && active.document.uri) {
                    targetPath = active.document.uri.fsPath;
                }
            }
            const modified = this.refactorManager?.getFileContent(targetPath || '') ?? '';
            let original = '';
            try {
                if (targetPath) {
                    const doc = await vscode.workspace.openTextDocument(targetPath);
                    original = doc.getText();
                }
                else {
                    original = '// original not available';
                }
            }
            catch {
                original = '// original not available';
            }
            const panel = vscode.window.createWebviewPanel('vsCodeAI.diff', `AI Refactor: ${targetPath ? targetPath.split(/[\\/]/).pop() : 'Preview'}`, vscode.ViewColumn.Beside, {
                enableScripts: true,
                localResourceRoots: [this._extensionUri],
            });
            panel.webview.html = this._getDiffHtml(panel.webview, original, modified);
            const onDispose = panel.onDidDispose(() => { });
            this._disposables.push(onDispose);
        }
        catch (err) {
            console.error('openDiffPanel failed', err);
        }
    }
    async _applyChanges(path) {
        try {
            let targetPath = path;
            if (!targetPath) {
                const active = vscode.window.activeTextEditor;
                if (active && active.document && active.document.uri) {
                    targetPath = active.document.uri.fsPath;
                }
            }
            if (!targetPath) {
                return;
            }
            if (!this.refactorManager || typeof this.refactorManager.applyChanges !== 'function') {
                return;
            }
            await this.refactorManager.applyChanges(targetPath);
            this.refresh();
        }
        catch (err) {
            console.error('applyChanges failed', err);
        }
    }
    _getHtml(webview) {
        const nonce = this._getNonce();
        // Read HTML template from external file
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webviews', 'sidebar-template.html');
        const scriptPath = path.join(this._extensionUri.fsPath, 'src', 'webviews', 'sidebar-script.js');
        try {
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            let scriptContent = fs.readFileSync(scriptPath, 'utf8');
            // Replace placeholders with actual values
            htmlContent = htmlContent.replace(/\${nonce}/g, nonce);
            htmlContent = htmlContent.replace(/\${webview\.cspSource}/g, webview.cspSource);
            // Convert resource paths to webview URIs
            const resourceFiles = [
                'codesense-logo.png', 'chat-icon.png', 'analyze-icon.png', 'search-icon.png',
                'assistant-icon.png', 'clear-icon.png', 'send-icon.png', 'analysis-icon.png',
                'bug-icon.png', 'summary-icon.png', 'copy-icon.png', 'search-empty-icon.png',
                'build-icon.png', 'language-icon.png', 'semantic-search-icon.png'
            ];
            resourceFiles.forEach(filename => {
                const resourcePath = vscode.Uri.joinPath(this._extensionUri, 'resources', filename);
                const webviewUri = webview.asWebviewUri(resourcePath);
                // Replace all occurrences of this resource path in the HTML
                const placeholder = `\${webview.cspSource}../../resources/${filename}`;
                htmlContent = htmlContent.replace(new RegExp(this._escapeRegExp(placeholder), 'g'), webviewUri.toString());
            });
            // Inject the JavaScript content directly into the HTML
            htmlContent = htmlContent.replace('<!-- SCRIPT_PLACEHOLDER -->', `<script nonce="${nonce}">${scriptContent}</script>`);
            return htmlContent;
        }
        catch (error) {
            console.error('Error loading HTML template:', error);
            // Fallback to a simple HTML if file reading fails
            return this._getFallbackHtml(webview);
        }
    }
    _escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    _getFallbackHtml(webview) {
        const nonce = this._getNonce();
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>VS AI Assistant</title>
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 20px; 
            color: var(--vscode-foreground);
            background: var(--vscode-background);
        }
        .loading { text-align: center; margin-top: 50px; }
    </style>
</head>
<body>
    <div class="loading">
        <h2>VS AI Assistant</h2>
        <p>Loading interface...</p>
    </div>
</body>
</html>`;
    }
    _getDiffHtml(webview, original, modified) {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource};">
    <title>Code Diff</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
        }
        pre {
            white-space: pre-wrap;
            border: 1px solid var(--vscode-panel-border);
            padding: 16px;
            border-radius: 6px;
            background: var(--vscode-editor-background);
            overflow: auto;
            max-height: 70vh;
        }
        h3 {
            margin-top: 0;
            color: var(--vscode-button-background);
        }
    </style>
</head>
<body>
    <h3>Original Code</h3>
    <pre>${this._escapeHtml(original)}</pre>
    <h3>Modified Code</h3>
    <pre>${this._escapeHtml(modified)}</pre>
</body>
</html>`;
    }
    _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    _escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    dispose() {
        try {
            for (const d of this._disposables) {
                try {
                    d.dispose();
                }
                catch {
                    // Ignore disposal errors
                }
            }
            if (this._refactorChangeDisposable) {
                try {
                    this._refactorChangeDisposable.dispose();
                }
                catch {
                    // Ignore disposal errors
                }
            }
        }
        catch (err) {
            console.error('SidebarViewProvider dispose error', err);
        }
    }
}
exports.SidebarViewProvider = SidebarViewProvider;
SidebarViewProvider.viewId = 'vsCodeAISidebar';
//# sourceMappingURL=sidebar-view-provider.js.map