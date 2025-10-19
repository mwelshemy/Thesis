const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

function activate(context) {
  console.log("🧠 AI Prototype Extension Activated!");

  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

  const provider = new MockUISidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("mockuiView", provider)
  );
}

class MockUISidebarProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true };
    const htmlPath = path.join(this.extensionUri.fsPath, "webview", "index.html");
    if (!fs.existsSync(htmlPath)) {
      webviewView.webview.html = `<h3 style="color:red;">❌ Missing webview/index.html</h3>`;
      return;
    }
    webviewView.webview.html = fs.readFileSync(htmlPath, "utf8");

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "sendPrompt") {
        const prompt = msg.text.trim();
        if (!prompt) return;
        try {
          const response = await callAI(prompt);
          webviewView.webview.postMessage({ command: "aiResponse", text: response });
        } catch (err) {
          webviewView.webview.postMessage({ command: "aiResponse", text: `❌ ${err.message}` });
        }
      }
    });
  }
}

async function callAI(prompt) {
  const apiToken = process.env.HUGGINGFACE_API_TOKEN;
  const model = process.env.AI_MODEL || "facebook/bart-large-cnn";
  if (!apiToken) throw new Error("Missing HUGGINGFACE_API_TOKEN in .env");

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  if (Array.isArray(data) && data[0]?.summary_text) return data[0].summary_text;
  if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;

  return "⚠️ No valid response.";
}

function deactivate() { }

module.exports = { activate, deactivate };
