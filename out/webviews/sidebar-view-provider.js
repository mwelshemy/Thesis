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
class SidebarViewProvider {
    constructor(_extensionUri, refactorManager) {
        this._extensionUri = _extensionUri;
        this.refactorManager = refactorManager;
        this._pending = [];
        this._disposables = [];
        this._output = vscode.window.createOutputChannel('VS AI - Sidebar');
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
            this._log('RefactorManager subscription failed', err);
        }
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        const messageDisp = webviewView.webview.onDidReceiveMessage(async (msg) => {
            try {
                if (msg.command === 'refresh') {
                    this.refresh();
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
                    if (action === 'indexStats') {
                        try {
                            const stats = this.refactorManager &&
                                typeof this.refactorManager.getIndexStats ===
                                    'function'
                                ? await this.refactorManager.getIndexStats()
                                : await this._deriveIndexStatsFallback();
                            this._post({ type: 'indexStats', value: stats });
                        }
                        catch (err) {
                            this._log('indexStats failed', err);
                            try {
                                await vscode.commands.executeCommand(`vs-code-ai-extension.${action}`, payload);
                            }
                            catch (e) {
                                this._log('Failed to execute indexStats extension command', e);
                                this.showAIAnalysis('Index Stats', 'Failed to fetch index stats.');
                            }
                        }
                        return;
                    }
                    try {
                        await vscode.commands.executeCommand(`vs-code-ai-extension.${action}`, payload);
                    }
                    catch (e) {
                        if (e && e.message && /not found/.test(String(e.message))) {
                            this._log(`Extension command not found: vs-code-ai-extension.${action}`, e);
                            this.showAIAnalysis('Command not found', `The command vs-code-ai-extension.${action} is not registered.`);
                        }
                        else if (e &&
                            (e.name === 'Canceled' ||
                                /canceled/i.test(String(e.message || '')))) {
                            this._log(`Command cancelled: ${action}`, e);
                            this.showAIAnalysis('Cancelled', `Operation "${action}" was cancelled.`);
                        }
                        else {
                            this._log('Failed to execute command from webview', e);
                            this.showAIAnalysis('Error', `Failed to run ${action}: ${String(e)}`);
                        }
                    }
                    return;
                }
            }
            catch (err) {
                this._log('Message handler error', err);
            }
        });
        this._disposables.push(messageDisp);
        for (const p of this._pending) {
            this._post({ type: 'aiOutput', title: p.title, content: p.content });
        }
        this._pending = [];
        this.refresh();
        try {
            const loc = vscode.workspace
                .getConfiguration('workbench')
                .get('sideBar.location');
            if (loc === 'right') {
                Promise.resolve(vscode.commands.executeCommand('workbench.action.toggleSidebarPosition')).catch(() => { });
            }
        }
        catch (err) {
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
            this._log('refresh error', err);
            try {
                this._view.webview.postMessage({ type: 'updateFiles', value: [] });
            }
            catch (e) {
                this._log('failed to post fallback updateFiles', e);
            }
        }
    }
    showAIAnalysis(title, content) {
        try {
            this._output.clear();
            this._output.appendLine(`🤖 ${title}`);
            this._output.appendLine('='.repeat(60));
            this._output.appendLine(content);
            this._output.appendLine('='.repeat(60));
            this._output.show(true);
        }
        catch (err) {
            console.error('Failed to write to output channel', err);
        }
        const msg = { type: 'aiOutput', title, content };
        if (!this._view) {
            this._pending.push({ title, content });
            return;
        }
        this._post(msg);
    }
    _post(message) {
        try {
            this._view?.webview.postMessage(message);
        }
        catch (err) {
            this._log('post to webview failed', err);
            if (message &&
                message.type === 'aiOutput' &&
                message.title &&
                message.content) {
                this._pending.push({ title: message.title, content: message.content });
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
            this._log('requestPreview failed', err);
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
            const onDispose = panel.onDidDispose(() => {
            });
            this._disposables.push(onDispose);
        }
        catch (err) {
            this._log('openDiffPanel failed', err);
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
                vscode.window.showErrorMessage('No file specified to apply changes.');
                return;
            }
            if (!this.refactorManager ||
                typeof this.refactorManager.applyChanges !== 'function') {
                vscode.window.showErrorMessage('No refactor manager available to apply changes.');
                return;
            }
            const ok = await this.refactorManager.applyChanges(targetPath);
            if (ok)
                vscode.window.showInformationMessage('Applied changes');
            this.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage('Apply failed');
            this._log('applyChanges failed', err);
        }
    }
    async _deriveIndexStatsFallback() {
        try {
            const files = this.refactorManager &&
                typeof this.refactorManager.getModifiedFiles === 'function'
                ? this.refactorManager.getModifiedFiles() || []
                : [];
            const filesIndexed = files.length;
            let totalTokens = 0;
            for (const f of files) {
                try {
                    const content = this.refactorManager &&
                        typeof this.refactorManager.getFileContent === 'function'
                        ? this.refactorManager.getFileContent(f.path)
                        : '';
                    totalTokens += Math.max(1, Math.round(((content || '').length || 0) / 4));
                }
                catch { }
            }
            const indexSize = `${Math.round(totalTokens * 0.001 * 100) / 100} KB (approx)`;
            const lastBuilt = 'unknown';
            return {
                filesIndexed,
                totalTokens,
                indexSize,
                lastBuilt,
            };
        }
        catch (err) {
            this._log('deriveIndexStatsFallback failed', err);
            return {
                filesIndexed: 0,
                totalTokens: 0,
                indexSize: '0 KB',
                lastBuilt: '—',
            };
        }
    }
    _getHtml(webview) {
        const nonce = this._getNonce();
        const preferredWidth = vscode.workspace
            .getConfiguration('vsCodeAI')
            .get('sidebarWidth', 380);
        return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>VS AI</title>
<style>
:root{
  --bg: var(--vscode-sideBar-background);
  --panel: var(--vscode-editor-background);
  --fg: var(--vscode-sideBar-foreground);
  --muted: var(--vscode-descriptionForeground);
  --border: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  --accent: var(--vscode-button-background);
  --accent-fg: var(--vscode-button-foreground);
  --muted-2: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}
*{box-sizing:border-box}
html,body{height:100%;margin:0;padding:12px;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased}
.wrap{margin:0 auto;max-width:${preferredWidth}px;min-width:280px;height:calc(100vh - 24px);display:flex;flex-direction:column;gap:10px}
.header{display:flex;align-items:center;gap:12px;position:relative}
.header .title{font-weight:700;letter-spacing:0.2px}
.header .top-right{margin-left:auto;display:flex;align-items:center;gap:8px}

/* Dropdown menu for panels & actions */
.dropdown { position:relative; display:inline-block;}
.dropdown-button { padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--fg);cursor:pointer;font-weight:600 }
.dropdown-button.primary { background:var(--accent); color:var(--accent-fg); border:1px solid transparent; box-shadow: 0 1px 0 rgba(0,0,0,0.04); }
.dropdown-content { display:none; position:absolute; right:0; top:calc(100% + 8px); background:var(--panel); min-width:260px; box-shadow:0 8px 24px rgba(2,6,23,0.3); border:1px solid var(--border); border-radius:8px; z-index:10; padding:8px; }
.dropdown-content .section-header { font-size:12px;color:var(--muted); padding:6px 8px; }
.dropdown-content button { display:block; width:100%; text-align:left; padding:10px 12px; border-radius:6px; background:transparent; border:none; color:var(--fg); cursor:pointer; font-size:13px }
.dropdown-content button:hover { background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent); }
.dropdown.show .dropdown-content { display:block; }

/* Panels and controls */
.section{padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--panel)}
.panel{display:none}
.panel.active{display:block}
.input, textarea, select { width:100%; box-sizing:border-box; padding:10px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--fg); font-size:13px }
textarea.input { resize:vertical; min-height:80px; }
.btn{padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--fg);cursor:pointer;font-weight:600}
.btn-primary{background:var(--accent);color:var(--accent-fg);border:none}
.results{margin-top:10px;padding:10px;border-radius:6px;border:1px dashed var(--border);background:transparent;white-space:pre-wrap;font-family:var(--vscode-editor-font-family);font-size:12px;min-height:60px}
.small{font-size:12px;color:var(--muted)}
.spinner { display:inline-block; width:14px; height:14px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation: spin 1s linear infinite; vertical-align:middle; margin-left:8px; }
@keyframes spin { to { transform: rotate(360deg); } }
.separator { height:1px; background:var(--border); margin:8px 0; border-radius:2px; opacity:0.6 }

/* Index stats grid */
.stats-grid { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px }
.stat { flex:1 1 120px; padding:10px; border-radius:6px; background:color-mix(in srgb, var(--vscode-foreground) 3%, transparent); border:1px solid var(--border); }
.stat .value { font-size:16px; font-weight:700; margin-top:6px }
.stat .label { font-size:12px; color:var(--muted) }
.note { font-size:12px; color:var(--muted); margin-top:6px }
</style>
</head>
<body>
  <div class="wrap" role="main">
    <div class="header">
      <div class="title">VS AI — Commands</div>

      <!-- Top-right dropdown containing panels and immediate actions -->
      <div class="top-right">
        <div class="dropdown" id="menu-dropdown" aria-haspopup="true">
          <button id="menu-button" class="dropdown-button primary" aria-expanded="false">Commands ▾</button>
          <div class="dropdown-content" role="menu" aria-labelledby="menu-button">
            <!-- Panels (open a panel in the left area) -->
            <div class="section-header">Panels</div>
            <button data-panel="ask" role="menuitem">Ask AI</button>
            <button data-panel="summarize" role="menuitem">Summarize File</button>
            <button data-panel="smart" role="menuitem">Smart Explain</button>
            <button data-panel="deep" role="menuitem">Deep Analysis</button>
            <button data-panel="pattern" role="menuitem">Pattern Analysis</button>
            <button data-panel="analyzeSearch" role="menuitem">Analyze Search Results</button>
            <button data-panel="searchProject" role="menuitem">Search Project</button>
            <button data-panel="searchByLang" role="menuitem">Search by Language</button>
            <button data-panel="quickSearch" role="menuitem">Quick File Search</button>
            <button data-panel="indexStats" role="menuitem">Index Statistics</button>

            <div class="separator" aria-hidden="true"></div>

            <!-- Immediate actions (run without opening a panel) -->
            <div class="section-header">Actions</div>
            <button data-action="buildSearchIndex" role="menuitem">Build Search Index</button>
            <button data-action="searchStats" role="menuitem">Search Statistics</button>
            <button data-action="indexStats" role="menuitem">Fetch Index Statistics</button>
            <button data-action="clearSearchIndex" role="menuitem">Clear Search Index</button>
            <div style="margin-top:6px"></div>

          </div>
        </div>

  
      </div>
    </div>

    <!-- Panels remain unchanged, they are opened via dropdown -->
    <!-- ASK AI -->
    <div id="ask" class="panel active section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Ask AI</strong></div>
        <div class="small">Paste snippet and ask the model</div>
      </div>
      <textarea id="ask-code" rows="6" class="input" placeholder="Paste code or snippet here..."></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <button id="ask-run" class="btn btn-primary">Explain Code</button>
        <button id="ask-preview" class="btn" title="Preview current file in preview diff">Preview Current File</button>
        <span id="ask-spinner" style="display:none" class="spinner" aria-hidden="true"></span>
      </div>
      <div id="ask-results" class="results">Results will appear here.</div>
    </div>

    <!-- Summarize File -->
    <div id="summarize" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Summarize File</strong></div>
        <div class="small">Uses active editor by default</div>
      </div>
      <input id="summarize-path" class="input" placeholder="Optional path (or leave empty to use current file)"/>
      <div style="margin-top:8px"><button id="summarize-run" class="btn btn-primary">Summarize</button><span id="summarize-spinner" style="display:none" class="spinner"></span></div>
      <div id="summarize-results" class="results">Summary will appear here.</div>
    </div>

    <!-- Smart Explain -->
    <div id="smart" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Smart Explain</strong></div>
        <div class="small">Include project context for better answers</div>
      </div>
      <textarea id="smart-code" rows="5" class="input" placeholder="Code or selection..."></textarea>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <label class="small"><input type="checkbox" id="smart-context" checked/> Include project context</label>
        <div style="flex:1"></div>
        <button id="smart-run" class="btn btn-primary">Explain with Context</button>
        <span id="smart-spinner" style="display:none" class="spinner"></span>
      </div>
      <div id="smart-results" class="results">Enhanced explanation will appear here.</div>
    </div>

    <!-- Deep Analysis -->
    <div id="deep" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Deep Analysis</strong></div>
        <div class="small">Full-file deep checks</div>
      </div>
      <textarea id="deep-code" rows="6" class="input" placeholder="Paste code for deep analysis..."></textarea>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <button id="deep-run" class="btn btn-primary">Deep Analyze</button>
        <span id="deep-spinner" style="display:none" class="spinner"></span>
      </div>
      <div id="deep-results" class="results">Deep analysis results will appear here.</div>
    </div>

    <!-- Pattern Analysis -->
    <div id="pattern" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Pattern Analysis</strong></div>
        <div class="small">Search for code patterns</div>
      </div>
      <input id="pattern-input" class="input" placeholder="Enter code pattern or snippet to search for"/>
      <div style="margin-top:8px"><button id="pattern-run" class="btn btn-primary">Find Patterns</button><span id="pattern-spinner" style="display:none" class="spinner"></span></div>
      <div id="pattern-results" class="results">Pattern results will appear here.</div>
    </div>

    <!-- Analyze Search Results -->
    <div id="analyzeSearch" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Analyze Search Results</strong></div>
        <div class="small">Run AI over search results</div>
      </div>
      <input id="analyze-query" class="input" placeholder="Enter search query to analyze"/>
      <div style="margin-top:8px"><button id="analyze-run" class="btn btn-primary">Analyze Results</button><span id="analyze-spinner" style="display:none" class="spinner"></span></div>
      <div id="analyze-results" class="results">AI analysis of search results will appear here.</div>
    </div>

    <!-- Search Project -->
    <div id="searchProject" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Search Project</strong></div>
        <div class="small">Fast project-wide search</div>
      </div>
      <input id="search-query" class="input" placeholder="Search term (function, variable, text)"/>
      <div style="margin-top:8px"><button id="search-run" class="btn btn-primary">Search</button><span id="search-spinner" style="display:none" class="spinner"></span></div>
      <div id="search-results" class="results">File results will appear here.</div>
    </div>

    <!-- Index Statistics -->
    <div id="indexStats" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Index Statistics</strong></div>
        <div class="small">Snapshot of the search index</div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <button id="index-refresh" class="btn btn-primary">Refresh Stats</button>
        <button id="index-clear" class="btn" title="Clear index (also available in Actions)">Clear Index</button>
        <span id="index-spinner" style="display:none" class="spinner"></span>
      </div>

      <div class="stats-grid" style="margin-top:10px">
        <div class="stat">
          <div class="label">Files indexed</div>
          <div id="stat-files" class="value">—</div>
        </div>
        <div class="stat">
          <div class="label">Total tokens (approx.)</div>
          <div id="stat-tokens" class="value">—</div>
        </div>
        <div class="stat">
          <div class="label">Index size</div>
          <div id="stat-size" class="value">—</div>
        </div>
        <div class="stat">
          <div class="label">Last built</div>
          <div id="stat-last" class="value">—</div>
        </div>
      </div>

      <div id="index-note" class="note">Press "Refresh Stats" to fetch the latest index metrics.</div>
    </div>

    <!-- Build Search Index (kept as panel for status, but also available as an action) -->
    <div id="buildIndex" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Build Search Index</strong></div>
        <div class="small">Rebuilds the in-memory index for faster queries</div>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <button id="build-run" class="btn btn-primary">Build Index</button>
        <span id="build-spinner" style="display:none" class="spinner"></span>
      </div>
      <div id="build-status" class="results">Status will appear here.</div>
    </div>

    <!-- Search Stats -->
    <div id="searchStats" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Search Statistics</strong></div>
        <div class="small">Quick summary of recent searches</div>
      </div>
      <div style="margin-top:8px"><button id="stats-refresh" class="btn">Refresh</button><span id="stats-spinner" style="display:none" class="spinner"></span></div>
      <div id="stats-results" class="results">Stats will appear here.</div>
    </div>

    <!-- Search by Language -->
    <div id="searchByLang" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Search by Language</strong></div>
        <div class="small">Filter project search by language</div>
      </div>
      <select id="lang-select" class="input">
        <option value="">Select language...</option>
        <option value="typescript">TypeScript</option>
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
        <option value="java">Java</option>
        <option value="css">CSS</option>
        <option value="html">HTML</option>
        <option value="markdown">Markdown</option>
      </select>
      <div style="margin-top:8px"><button id="lang-run" class="btn btn-primary">Search</button><span id="lang-spinner" style="display:none" class="spinner"></span></div>
      <div id="lang-results" class="results">Language results will appear here.</div>
    </div>

    <!-- Clear Search Index -->
    <div id="clearIndex" class="panel section">
      <div><strong>Clear Search Index</strong></div>
      <div class="small">This removes all indexed files from memory.</div>
      <div style="margin-top:8px"><button id="clear-run" class="btn btn-primary">Clear Index</button><span id="clear-spinner" style="display:none" class="spinner"></span></div>
      <div id="clear-results" class="results">Status will appear here.</div>
    </div>

    <!-- Quick File Search -->
    <div id="quickSearch" class="panel section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Quick File Search</strong></div>
        <div class="small">Open a file quickly</div>
      </div>
      <input id="quick-input" class="input" placeholder="Start typing file name..."/>
      <div style="margin-top:8px"><button id="quick-run" class="btn btn-primary">Quick Search</button><span id="quick-spinner" style="display:none" class="spinner"></span></div>
      <div id="quick-results" class="results">Pick results will appear here.</div>
    </div>
  </div>

<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();

  // Panel navigation (previously tabs) is now driven by the dropdown menu.
  function setActive(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(panelId);
    if (el) el.classList.add('active');
    // focus first input in panel for UX
    const panel = document.getElementById(panelId);
    if (panel) {
      const input = panel.querySelector('input, textarea, select, button');
      if (input) input.focus();
    }
  }

  // Dropdown menu behavior
  const dropdown = document.getElementById('menu-dropdown');
  const menuButton = document.getElementById('menu-button');
  const menuContent = dropdown.querySelector('.dropdown-content');

  function closeMenu() {
    dropdown.classList.remove('show');
    menuButton.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    dropdown.classList.add('show');
    menuButton.setAttribute('aria-expanded', 'true');
  }

  menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('show')) closeMenu(); else openMenu();
  });

  // Close menu when clicking outside
  window.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) closeMenu();
  });

  // Wire menu items: either open panels (data-panel) or run immediate actions (data-action)
  Array.from(menuContent.querySelectorAll('button')).forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const panel = btn.getAttribute('data-panel');
      const action = btn.getAttribute('data-action');
      closeMenu();
      if (panel) {
        setActive(panel);
      } else if (action) {
        // run immediate actions with UI feedback
        menuButton.disabled = true;
        vscode.postMessage({ command: 'run', action: action });
        setTimeout(() => { menuButton.disabled = false; }, 700);
      }
    });
  });

  // Helper: toggle spinner + disable button (used by panel-local buttons)
  function runWithUi(buttonId, spinnerId, fn) {
    const btn = document.getElementById(buttonId);
    const sp = document.getElementById(spinnerId);
    if (btn) btn.disabled = true;
    if (sp) sp.style.display = 'inline-block';
    Promise.resolve().then(fn).finally(() => {
      if (btn) btn.disabled = false;
      if (sp) sp.style.display = 'none';
    });
  }

  // Wire panel-local buttons to run actions
  document.getElementById('ask-run').addEventListener('click', () => {
    const code = (document.getElementById('ask-code')).value;
    runWithUi('ask-run','ask-spinner', () => vscode.postMessage({ command:'run', action:'askAI', payload:{ code } }));
  });

  document.getElementById('ask-preview').addEventListener('click', () => {
    // request a preview of the active file (provider handles this action directly)
    vscode.postMessage({ command:'run', action:'requestPreview', payload: { path: undefined } });
  });

  document.getElementById('summarize-run').addEventListener('click', () => {
    const path = (document.getElementById('summarize-path')).value;
    runWithUi('summarize-run','summarize-spinner', () => vscode.postMessage({ command:'run', action:'summarizeFile', payload:{ path: path || undefined } }));
  });

  document.getElementById('smart-run').addEventListener('click', () => {
    const code = (document.getElementById('smart-code')).value;
    const useContext = (document.getElementById('smart-context')).checked;
    runWithUi('smart-run','smart-spinner', () => vscode.postMessage({ command:'run', action:'smartExplain', payload:{ code, useContext } }));
  });

  document.getElementById('deep-run').addEventListener('click', () => {
    const code = (document.getElementById('deep-code')).value;
    runWithUi('deep-run','deep-spinner', () => vscode.postMessage({ command:'run', action:'deepAnalysis', payload:{ code } }));
  });

  document.getElementById('pattern-run').addEventListener('click', () => {
    const pattern = (document.getElementById('pattern-input')).value;
    runWithUi('pattern-run','pattern-spinner', () => vscode.postMessage({ command:'run', action:'patternAnalysis', payload:{ pattern } }));
  });

  document.getElementById('analyze-run').addEventListener('click', () => {
    const q = (document.getElementById('analyze-query')).value;
    runWithUi('analyze-run','analyze-spinner', () => vscode.postMessage({ command:'run', action:'analyzeSearchResults', payload:{ query: q } }));
  });

  document.getElementById('search-run').addEventListener('click', () => {
    const q = (document.getElementById('search-query')).value;
    runWithUi('search-run','search-spinner', () => vscode.postMessage({ command:'run', action:'searchProject', payload:{ query: q } }));
  });

  document.getElementById('build-run').addEventListener('click', () => {
    runWithUi('build-run','build-spinner', () => vscode.postMessage({ command:'run', action:'buildSearchIndex' }));
  });

  document.getElementById('stats-refresh').addEventListener('click', () => {
    runWithUi('stats-refresh','stats-spinner', () => vscode.postMessage({ command:'run', action:'searchStats' }));
  });

  document.getElementById('lang-run').addEventListener('click', () => {
    const lang = (document.getElementById('lang-select')).value;
    runWithUi('lang-run','lang-spinner', () => vscode.postMessage({ command:'run', action:'searchByLanguage', payload:{ language: lang } }));
  });

  document.getElementById('clear-run').addEventListener('click', () => {
    if (confirm('Clear the search index? This removes all indexed files.')) {
      runWithUi('clear-run','clear-spinner', () => vscode.postMessage({ command:'run', action:'clearSearchIndex' }));
    }
  });

  document.getElementById('quick-run').addEventListener('click', () => {
    const q = (document.getElementById('quick-input')).value;
    runWithUi('quick-run','quick-spinner', () => vscode.postMessage({ command:'run', action:'quickFileSearch', payload:{ query: q } }));
  });

  // Index stats: refresh & clear handlers
  document.getElementById('index-refresh').addEventListener('click', () => {
    runWithUi('index-refresh','index-spinner', () => vscode.postMessage({ command:'run', action:'indexStats' }));
  });
  document.getElementById('index-clear').addEventListener('click', () => {
    if (confirm('Clear the search index? This removes all indexed files.')) {
      runWithUi('index-clear','index-spinner', () => vscode.postMessage({ command:'run', action:'clearSearchIndex' }));
      // after clearing, update UI
      setTimeout(() => {
        document.getElementById('stat-files').textContent = '0';
        document.getElementById('stat-tokens').textContent = '0';
        document.getElementById('stat-size').textContent = '0 KB';
        document.getElementById('stat-last').textContent = '—';
      }, 400);
    }
  });

  // Message handling: map incoming aiOutput to appropriate results area and handle indexStats payloads
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'aiOutput') {
      const title = (msg.title || '').toString().toLowerCase();
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);

      // mapping by action keywords in title (keeps UI simple)
      if (title.includes('ask ai') || title.includes('explain')) {
        document.getElementById('ask-results').textContent = content;
        setActive('ask');
      } else if (title.includes('summarize') || title.includes('summary')) {
        document.getElementById('summarize-results').textContent = content;
        setActive('summarize');
      } else if (title.includes('smart')) {
        document.getElementById('smart-results').textContent = content;
        setActive('smart');
      } else if (title.includes('deep')) {
        document.getElementById('deep-results').textContent = content;
        setActive('deep');
      } else if (title.includes('pattern')) {
        document.getElementById('pattern-results').textContent = content;
        setActive('pattern');
      } else if (title.includes('analyze') && title.includes('search')) {
        document.getElementById('analyze-results').textContent = content;
        setActive('analyzeSearch');
      } else if ((title.includes('index stat') || title.includes('index statistics') || title.includes('index stats') || title.includes('index'))) {
        // AI sent index statistics as aiOutput
        try {
          // try to parse structured content if present
          const parsed = typeof msg.content === 'string' ? tryParseJSON(msg.content) : msg.content;
          applyIndexStats(parsed);
        } catch (e) {
          // fallback: put raw content into build-status and index panel results
          document.getElementById('build-status').textContent = content;
          document.getElementById('index-note').textContent = content;
        }
        setActive('indexStats');
      } else if (title.includes('search') && !title.includes('analyze')) {
        document.getElementById('search-results').textContent = content;
        setActive('searchProject');
      } else if (title.includes('index') || title.includes('build')) {
        document.getElementById('build-status').textContent = content;
        setActive('buildIndex');
      } else if (title.includes('stats')) {
        document.getElementById('stats-results').textContent = content;
        setActive('searchStats');
      } else if (title.includes('language')) {
        document.getElementById('lang-results').textContent = content;
        setActive('searchByLang');
      } else if (title.includes('clear')) {
        document.getElementById('clear-results').textContent = content;
        setActive('clearIndex');
      } else if (title.includes('quick') || title.includes('open')) {
        document.getElementById('quick-results').textContent = content;
        setActive('quickSearch');
      } else {
        // default -> analyzeSearch panel
        document.getElementById('analyze-results').textContent = content;
        setActive('analyzeSearch');
      }
    } else if (msg.type === 'updateFiles') {
      // optional: place files list into summarize panel (simple)
      const files = msg.value || [];
      const el = document.getElementById('summarize-path');
      // set placeholder to first modified file for convenience (if present)
      if (el && files.length > 0) {
        try {
          (el).placeholder = files[0].path || '';
        } catch (e) {
          // ignore malformed entries
        }
      }
    } else if (msg.type === 'previewData') {
      // show preview in deep panel and ask panel
      const combined = (msg.original || '') + '\\n\\n== Refactored ==\\n\\n' + (msg.modified || '');
      document.getElementById('deep-results').textContent = combined;
      document.getElementById('ask-results').textContent = combined;
      setActive('deep');
    } else if (msg.type === 'indexStats') {
      // structured index stats payload expected:
      // { filesIndexed: number, totalTokens: number, indexSize: string, lastBuilt: string }
      applyIndexStats(msg.value || msg);
      setActive('indexStats');
    }
  });

  function tryParseJSON(s) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }

  function applyIndexStats(data) {
    try {
      const files = data.filesIndexed ?? data.count ?? data.files ?? '—';
      const tokens = data.totalTokens ?? data.tokens ?? '—';
      const size = data.indexSize ?? data.size ?? (data.bytes ? formatBytes(data.bytes) : '—');
      const last = data.lastBuilt ?? data.last ?? data.updatedAt ?? '—';

      document.getElementById('stat-files').textContent = String(files);
      document.getElementById('stat-tokens').textContent = String(tokens);
      document.getElementById('stat-size').textContent = String(size);
      document.getElementById('stat-last').textContent = String(last);
      document.getElementById('index-note').textContent = 'Index stats updated.';
    } catch (e) {
      document.getElementById('index-note').textContent = 'Failed to parse index stats.';
    }
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return bytes;
    const kb = 1024;
    if (bytes < kb) return bytes + ' B';
    if (bytes < kb * kb) return Math.round(bytes / kb) + ' KB';
    return Math.round(bytes / (kb * kb)) + ' MB';
  }

  // initial refresh
  vscode.postMessage({ command: 'refresh' });
})();
</script>
</body>
</html>`;
    }
    _getDiffHtml(webview, original, modified) {
        const nonce = this._getNonce();
        return `<!doctype html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Diff</title><style>body{font-family:var(--vscode-editor-font-family);padding:12px;color:var(--vscode-editor-foreground)} pre{white-space:pre-wrap;border:1px solid var(--vscode-editorWidget-border);padding:8px;border-radius:6px;background:var(--vscode-editor-background);overflow:auto;max-height:80vh}</style></head><body><h3>Original</h3><pre>${this._escapeHtml(original)}</pre><h3>Refactored</h3><pre>${this._escapeHtml(modified)}</pre></body></html>`;
    }
    _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
    _escapeHtml(s) {
        return (s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    dispose() {
        try {
            for (const d of this._disposables) {
                try {
                    d.dispose();
                }
                catch { }
            }
            if (this._refactorChangeDisposable) {
                try {
                    this._refactorChangeDisposable.dispose();
                }
                catch { }
            }
            try {
                this._output.dispose();
            }
            catch { }
        }
        catch (err) {
            console.error('SidebarViewProvider dispose error', err);
        }
    }
    _log(...args) {
        try {
            this._output.appendLine(`[${new Date().toISOString()}] ${args
                .map((a) => (a instanceof Error ? a.message : String(a)))
                .join(' ')}`);
        }
        catch {
        }
        console.error(...args);
    }
}
exports.SidebarViewProvider = SidebarViewProvider;
SidebarViewProvider.viewId = 'vsCodeAISidebar';
//# sourceMappingURL=sidebar-view-provider.js.map