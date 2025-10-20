import * as vscode from "vscode";
import { callAI } from "./ai/callAI"; // ✅ this uses your real model

export function activate(context: vscode.ExtensionContext) {
  console.log("🧠 Mock UI AI Extension Activated");

  const disposable = vscode.commands.registerCommand("mockui.openPanel", () => {
    const panel = vscode.window.createWebviewPanel(
      "mockui",
      "AI Assistant 🤖",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent();

    // listen for messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "ask") {
        try {
          // 🔥 call the real model
          const response = await callAI(message.prompt);
          panel.webview.postMessage({ type: "reply", text: response });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          panel.webview.postMessage({ type: "reply", text: `⚠️ Error: ${errorMsg}` });
        }
      }
    });
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(): string {
  return /*html*/ `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Assistant 🤖</title>
    <style>
      body {
        background-color: #1e1e1e;
        color: #ffffff;
        font-family: sans-serif;
        padding: 20px;
      }
      h2 {
        color: #0af;
      }
      input {
        width: 80%;
        padding: 8px;
        border-radius: 4px;
        border: none;
        background: #252526;
        color: #fff;
      }
      button {
        background: #007acc;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover {
        background: #0a84ff;
      }
      pre {
        background: #252526;
        padding: 10px;
        border-radius: 6px;
        margin-top: 10px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <h2>AI Assistant 🤖</h2>
    <input id="prompt" placeholder="Ask me something..." />
    <button id="send">Send</button>
    <pre id="output"></pre>

    <script>
      const vscode = acquireVsCodeApi();

      const input = document.getElementById('prompt');
      const output = document.getElementById('output');
      const sendBtn = document.getElementById('send');

      sendBtn.addEventListener('click', sendPrompt);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') sendPrompt();
      });

      function sendPrompt() {
        const prompt = input.value.trim();
        if (!prompt) return;
        output.textContent = "⏳ Thinking...";
        vscode.postMessage({ type: "ask", prompt });
      }

      window.addEventListener("message", (event) => {
        const { type, text } = event.data;
        if (type === "reply") {
          output.textContent = text;
        }
      });
    </script>
  </body>
  </html>`;
}

export function deactivate() {}
