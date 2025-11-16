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
exports.SidebarPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class SidebarPanel {
    constructor(panel) {
        this._disposables = [];
        this._modifiedFiles = new Map();
        this._panel = panel;
        this._initializeWebview();
    }
    static createOrShow() {
        const column = vscode.ViewColumn.Beside;
        if (SidebarPanel.currentPanel) {
            SidebarPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('vsCodeAI.panel', 'VS AI - Modified Files', column, {
            enableScripts: true,
        });
        SidebarPanel.currentPanel = new SidebarPanel(panel);
    }
    _initializeWebview() {
        this._panel.webview.html = this._getHtmlForWebview();
        this._panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'openFile':
                    await this._openFile(data.value);
                    return;
                case 'applyChanges':
                    await this._applyChanges(data.value);
                    return;
                case 'discardChanges':
                    await this._discardChanges(data.value);
                    return;
            }
        }, null, this._disposables);
    }
    async _openFile(filePath) {
        try {
            await vscode.commands.executeCommand('vs-code-ai-extension.openFile', filePath);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
        }
    }
    async _applyChanges(filePath) {
        const content = this._modifiedFiles.get(filePath);
        if (!content) {
            return;
        }
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            edit.replace(document.uri, fullRange, content);
            await vscode.workspace.applyEdit(edit);
            await document.save();
            this._modifiedFiles.delete(filePath);
            this._updateWebview();
            vscode.window.showInformationMessage(`Changes applied to ${path.basename(filePath)}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to apply changes: ${error}`);
        }
    }
    async _discardChanges(filePath) {
        this._modifiedFiles.delete(filePath);
        this._updateWebview();
        vscode.window.showInformationMessage(`Changes discarded for ${path.basename(filePath)}`);
    }
    addModifiedFile(filePath, content) {
        this._modifiedFiles.set(filePath, content);
        this._updateWebview();
    }
    removeModifiedFile(filePath) {
        this._modifiedFiles.delete(filePath);
        this._updateWebview();
    }
    getModifiedFiles() {
        return Array.from(this._modifiedFiles.entries()).map(([filePath]) => ({
            path: filePath,
            name: path.basename(filePath),
        }));
    }
    _updateWebview() {
        this._panel.webview.postMessage({
            type: 'updateFiles',
            value: this.getModifiedFiles(),
        });
    }
    _getHtmlForWebview() {
        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>VS AI - Modified Files</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: var(--vscode-font-family);
              font-size: var(--vscode-font-size);
              color: var(--vscode-foreground);
              background-color: var(--vscode-editor-background);
              padding: 16px;
            }
            
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 16px;
              padding-bottom: 8px;
              border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .title {
              font-size: 16px;
              font-weight: 600;
              color: var(--vscode-titleBar-activeForeground);
            }
            
            .file-count {
              background: var(--vscode-badge-background);
              color: var(--vscode-badge-foreground);
              padding: 2px 8px;
              border-radius: 10px;
              font-size: 12px;
            }
            
            .files-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            
            .file-item {
              background: var(--vscode-list-inactiveSelectionBackground);
              border: 1px solid var(--vscode-panel-border);
              border-radius: 4px;
              padding: 12px;
              cursor: pointer;
              transition: all 0.2s ease;
            }
            
            .file-item:hover {
              background: var(--vscode-list-hoverBackground);
              border-color: var(--vscode-focusBorder);
            }
            
            .file-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 8px;
            }
            
            .file-name {
              font-weight: 600;
              color: var(--vscode-symbolIcon-classForeground);
              font-size: 13px;
            }
            
            .file-path {
              font-size: 11px;
              color: var(--vscode-descriptionForeground);
              margin-bottom: 8px;
              word-break: break-all;
            }
            
            .file-actions {
              display: flex;
              gap: 8px;
              margin-top: 8px;
            }
            
            .btn {
              padding: 4px 8px;
              border: none;
              border-radius: 3px;
              font-size: 11px;
              cursor: pointer;
              transition: background 0.2s ease;
            }
            
            .btn-primary {
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
            }
            
            .btn-primary:hover {
              background: var(--vscode-button-hoverBackground);
            }
            
            .btn-secondary {
              background: var(--vscode-button-secondaryBackground);
              color: var(--vscode-button-secondaryForeground);
            }
            
            .btn-secondary:hover {
              background: var(--vscode-button-secondaryHoverBackground);
            }
            
            .empty-state {
              text-align: center;
              padding: 40px 20px;
              color: var(--vscode-descriptionForeground);
            }
            
            .empty-state-icon {
              font-size: 48px;
              margin-bottom: 16px;
              opacity: 0.5;
            }
            
            .file-badge {
              background: var(--vscode-activityBarBadge-background);
              color: var(--vscode-activityBarBadge-foreground);
              padding: 2px 6px;
              border-radius: 8px;
              font-size: 10px;
              font-weight: 600;
            }
          </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Modified Files</div>
          <div class="file-count" id="fileCount">0 files</div>
        </div>
        
        <div id="filesList" class="files-list">
          <div class="empty-state">
            <div class="empty-state-icon">📝</div>
            <div>No modified files yet</div>
            <div style="font-size: 12px; margin-top: 8px;">
              AI refactoring suggestions will appear here
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          
          function updateFilesList(files) {
            const filesList = document.getElementById('filesList');
            const fileCount = document.getElementById('fileCount');
            
            fileCount.textContent = files.length + ' file' + (files.length !== 1 ? 's' : '');
            
            if (files.length === 0) {
              filesList.innerHTML = \`
                <div class="empty-state">
                  <div class="empty-state-icon">📝</div>
                  <div>No modified files yet</div>
                  <div style="font-size: 12px; margin-top: 8px;">
                    AI refactoring suggestions will appear here
                  </div>
                </div>
              \`;
              return;
            }
            
            filesList.innerHTML = files.map(file => \`
              <div class="file-item" onclick="openFile('\${file.path}')">
                <div class="file-header">
                  <div class="file-name">\${file.name}</div>
                  <div class="file-badge">MODIFIED</div>
                </div>
                <div class="file-path">\${file.path}</div>
                <div class="file-actions">
                  <button class="btn btn-primary" onclick="event.stopPropagation(); applyChanges('\${file.path}')">
                    Apply Changes
                  </button>
                  <button class="btn btn-secondary" onclick="event.stopPropagation(); discardChanges('\${file.path}')">
                    Discard
                  </button>
                </div>
              </div>
            \`).join('');
          }
          
          function openFile(filePath) {
            vscode.postMessage({
              type: 'openFile',
              value: filePath
            });
          }
          
          function applyChanges(filePath) {
            vscode.postMessage({
              type: 'applyChanges',
              value: filePath
            });
          }
          
          function discardChanges(filePath) {
            vscode.postMessage({
              type: 'discardChanges',
              value: filePath
            });
          }
          
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
              case 'updateFiles':
                updateFilesList(message.value);
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
    }
    dispose() {
        SidebarPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
exports.SidebarPanel = SidebarPanel;
//# sourceMappingURL=sidebar-panel.js.map