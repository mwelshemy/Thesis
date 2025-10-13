// extension/src/panel.ts
import * as vscode from 'vscode';

export class AIWebViewPanel {
  public static currentPanel: AIWebViewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.Beside;

    if (AIWebViewPanel.currentPanel) {
      AIWebViewPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiPrototype',
      'AI Code Assistant (Mock)',
      column,
      { enableScripts: true }
    );

    AIWebViewPanel.currentPanel = new AIWebViewPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._update();
    this._panel.onDidDispose(() => (AIWebViewPanel.currentPanel = undefined));
  }

  private _update() {
    const webview = this._panel.webview;
    webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css')
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <link href="${styleUri}" rel="stylesheet">
        <title>AI Code Assistant</title>
      </head>
      <body>
        <div class="container">
          <h2>🧠 Code Retrieval Assistant (Mock)</h2>
          <textarea id="query" placeholder="Type your query here..."></textarea>
          <button id="send">Run</button>
          <div id="response" class="response-box">
            <p>Waiting for input...</p>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('send').addEventListener('click', () => {
            const query = document.getElementById('query').value;
            document.getElementById('response').innerHTML = "<p><em>Retrieving...</em></p>";

            setTimeout(() => {
              document.getElementById('response').innerHTML = \`
                <h4>🔍 Mock Result:</h4>
                <p>The system analyzed your query: "<strong>\${query}</strong>"</p>
                <pre>function connectToDB() { /* mock code */ }</pre>
                <p>AI Summary: Connects to a database and validates input.</p>
              \`;
            }, 1200);
          });
        </script>
      </body>
      </html>
    `;
  }
}
