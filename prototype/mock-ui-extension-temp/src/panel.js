"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIWebViewPanel = void 0;
// extension/src/panel.ts
var vscode = require("vscode");
var AIWebViewPanel = /** @class */ (function () {
    function AIWebViewPanel(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update();
        this._panel.onDidDispose(function () { return (AIWebViewPanel.currentPanel = undefined); });
    }
    AIWebViewPanel.createOrShow = function (extensionUri) {
        var column = vscode.ViewColumn.Beside;
        if (AIWebViewPanel.currentPanel) {
            AIWebViewPanel.currentPanel._panel.reveal(column);
            return;
        }
        var panel = vscode.window.createWebviewPanel('aiPrototype', 'AI Code Assistant (Mock)', column, { enableScripts: true });
        AIWebViewPanel.currentPanel = new AIWebViewPanel(panel, extensionUri);
    };
    AIWebViewPanel.prototype._update = function () {
        var webview = this._panel.webview;
        webview.html = this._getHtmlForWebview(webview);
    };
    AIWebViewPanel.prototype._getHtmlForWebview = function (webview) {
        var styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css'));
        return "\n      <!DOCTYPE html>\n      <html lang=\"en\">\n      <head>\n        <meta charset=\"UTF-8\">\n        <link href=\"".concat(styleUri, "\" rel=\"stylesheet\">\n        <title>AI Code Assistant</title>\n      </head>\n      <body>\n        <div class=\"container\">\n          <h2>\uD83E\uDDE0 Code Retrieval Assistant (Mock)</h2>\n          <textarea id=\"query\" placeholder=\"Type your query here...\"></textarea>\n          <button id=\"send\">Run</button>\n          <div id=\"response\" class=\"response-box\">\n            <p>Waiting for input...</p>\n          </div>\n        </div>\n        <script>\n          const vscode = acquireVsCodeApi();\n          document.getElementById('send').addEventListener('click', () => {\n            const query = document.getElementById('query').value;\n            document.getElementById('response').innerHTML = \"<p><em>Retrieving...</em></p>\";\n\n            setTimeout(() => {\n              document.getElementById('response').innerHTML = `\n                <h4>\uD83D\uDD0D Mock Result:</h4>\n                <p>The system analyzed your query: \"<strong>${query}</strong>\"</p>\n                <pre>function connectToDB() { /* mock code */ }</pre>\n                <p>AI Summary: Connects to a database and validates input.</p>\n              `;\n            }, 1200);\n          });\n        </script>\n      </body>\n      </html>\n    ");
    };
    return AIWebViewPanel;
}());
exports.AIWebViewPanel = AIWebViewPanel;
