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
exports.SidebarContextMenuProvider = exports.SidebarUtils = exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class SidebarProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.modifiedFiles = new Map();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        else {
            const items = [];
            this.modifiedFiles.forEach((_content, filePath) => {
                items.push(new FileItem(path.basename(filePath), filePath, vscode.TreeItemCollapsibleState.None));
            });
            if (items.length === 0) {
                items.push(new FileItem('No modified files yet', '', vscode.TreeItemCollapsibleState.None, {
                    command: 'vs-code-ai-extension.aiRefactor',
                    title: 'Refactor Code',
                    tooltip: 'Start refactoring code to see files here',
                }));
            }
            return Promise.resolve(items);
        }
    }
    addModifiedFile(filePath, content) {
        this.modifiedFiles.set(filePath, content);
        this.refresh();
    }
    removeModifiedFile(filePath) {
        this.modifiedFiles.delete(filePath);
        this.refresh();
    }
    clearAllFiles() {
        this.modifiedFiles.clear();
        this.refresh();
    }
    getModifiedFiles() {
        return Array.from(this.modifiedFiles.entries()).map(([filePath]) => ({
            path: filePath,
            name: path.basename(filePath),
        }));
    }
    getFileContent(filePath) {
        return this.modifiedFiles.get(filePath);
    }
    hasModifiedFiles() {
        return this.modifiedFiles.size > 0;
    }
    getFileCount() {
        return this.modifiedFiles.size;
    }
}
exports.SidebarProvider = SidebarProvider;
class FileItem extends vscode.TreeItem {
    constructor(label, filePath, collapsibleState, command) {
        super(label, collapsibleState);
        this.label = label;
        this.filePath = filePath;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.tooltip = this.filePath || 'Click to start refactoring';
        this.description = this.filePath
            ? path.dirname(this.filePath)
            : 'Use AI Refactor command';
        if (this.filePath) {
            this.contextValue = 'modifiedFile';
            this.iconPath = new vscode.ThemeIcon('file-code');
            this.command = {
                command: 'vs-code-ai-extension.openFile',
                title: 'Open File',
                arguments: [filePath],
            };
        }
        else {
            this.iconPath = new vscode.ThemeIcon('lightbulb');
            this.contextValue = 'welcomeMessage';
        }
    }
}
class SidebarUtils {
    static createDiffPreview(originalContent, modifiedContent) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Refactoring Preview</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 16px;
                        margin: 0;
                    }
                    .diff-container {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 16px;
                    }
                    .diff-section {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 12px;
                    }
                    .diff-header {
                        font-weight: bold;
                        margin-bottom: 8px;
                        padding-bottom: 4px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .original .diff-header {
                        color: var(--vscode-errorForeground);
                    }
                    .modified .diff-header {
                        color: var(--vscode-testing-iconPassed);
                    }
                    pre {
                        margin: 0;
                        white-space: pre-wrap;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                    }
                    .code-block {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 8px;
                        border-radius: 3px;
                        max-height: 400px;
                        overflow-y: auto;
                    }
                </style>
            </head>
            <body>
                <div class="diff-container">
                    <div class="diff-section original">
                        <div class="diff-header">Original Code</div>
                        <div class="code-block">
                            <pre>${this.escapeHtml(originalContent)}</pre>
                        </div>
                    </div>
                    <div class="diff-section modified">
                        <div class="diff-header">AI Refactored Code</div>
                        <div class="code-block">
                            <pre>${this.escapeHtml(modifiedContent)}</pre>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    static escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    static async showFileActions(filePath) {
        const items = [
            {
                label: '$(check) Apply Changes',
                description: 'Apply the AI refactoring to the file',
                action: 'apply',
            },
            {
                label: '$(diff) Preview Changes',
                description: 'Show diff between original and refactored code',
                action: 'preview',
            },
            {
                label: '$(close) Discard Changes',
                description: 'Remove this file from modified list',
                action: 'discard',
            },
            {
                label: '$(file) Open File',
                description: 'Open the file in editor',
                action: 'open',
            },
        ];
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Choose action for ${path.basename(filePath)}`,
        });
        return selected?.action;
    }
    static async showDiff(filePath, originalContent, modifiedContent) {
        const panel = vscode.window.createWebviewPanel('aiRefactorDiff', `AI Refactor: ${path.basename(filePath)}`, vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        panel.webview.html = this.createDiffPreview(originalContent, modifiedContent);
    }
}
exports.SidebarUtils = SidebarUtils;
class SidebarContextMenuProvider {
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        const items = [];
        if (!element) {
            items.push(this.createContextItem('Apply All Changes', 'vs-code-ai-extension.applyAllChanges', 'check'), this.createContextItem('Clear All Changes', 'vs-code-ai-extension.clearAllChanges', 'clear-all'), this.createContextItem('Refresh', 'vs-code-ai-extension.showSidebar', 'refresh'));
        }
        return Promise.resolve(items);
    }
    createContextItem(label, command, icon) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.command = { command, title: label };
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
}
exports.SidebarContextMenuProvider = SidebarContextMenuProvider;
//# sourceMappingURL=sidebar-provider.js.map