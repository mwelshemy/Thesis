// extension.js
const vscode = require("vscode");
const path = require("path");

// ai-wrapper should be in the extension root next to this file
// it exposes: runCallAI(prompt, opts) and log(...)
const { runCallAI, log: aiLog } = require(path.join(__dirname, "ai-wrapper.js"));

/* -------------------------
   Activate / Deactivate
   ------------------------- */
function activate(context) {
  // Register the sidebar tree view
  const treeDataProvider = new MockUITreeDataProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("mockuiView", treeDataProvider)
  );

  // Register command that opens the chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand("mockui.openChat", () => {
      createChatPanel(context.extensionUri);
    })
  );
}

function deactivate() {
  // nothing special for now
}

/* -------------------------
   Sidebar (TreeData)
   ------------------------- */
class MockUITreeDataProvider {
  getTreeItem(element) {
    return element;
  }

  getChildren() {
    const chatItem = new vscode.TreeItem("💬 Chat with AI", vscode.TreeItemCollapsibleState.None);
    // clicking the tree item opens the chat
    chatItem.command = { command: "mockui.openChat", title: "Open AI Chat" };

    return [
      chatItem,
      new vscode.TreeItem("🔧 Generate Code", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("🐞 Fix Errors", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("📚 Explain Code", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("✅ Write Tests", vscode.TreeItemCollapsibleState.None),
    ];
  }
}

/* -------------------------
   Chat Panel
   ------------------------- */
function createChatPanel(extensionUri) {
  const panel = vscode.window.createWebviewPanel(
    "mockAiChat",
    "AI Assistant",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getChatHtml(panel.webview, extensionUri);

  // Listen for messages from the webview (user messages)
  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "userMessage") {
        const userText = String(msg.text || "");
        panel.webview.postMessage({ type: "aiTyping", value: true });
        aiLog(`[EXT] user -> ai: ${userText}`);

        // call Nadia's AI through wrapper (safe)
        const aiResponse = await runCallAI(userText, { source: "mock-ui" }).catch(err => {
          aiLog("[EXT] runCallAI threw:", err && (err.message || err.toString()));
          return null;
        });

        // Normalize reply into a single string containing optional fenced code block
        let reply = "";
        if (!aiResponse) {
          reply = `(Mock) No response from AI module.`;
        } else if (typeof aiResponse === "string") {
          reply = aiResponse;
        } else if (aiResponse.text) {
          reply = aiResponse.text;
          if (aiResponse.formatted && aiResponse.formatted.code) {
            reply += `\n\n\`\`\`\n${aiResponse.formatted.code}\n\`\`\``;
          }
        } else if (aiResponse.result) {
          reply = String(aiResponse.result);
        } else {
          // fallback: stringify
          try {
            reply = JSON.stringify(aiResponse, null, 2);
          } catch (e) {
            reply = String(aiResponse);
          }
        }

        panel.webview.postMessage({ type: "aiReply", value: reply });
        panel.webview.postMessage({ type: "aiTyping", value: false });
        aiLog("[EXT] ai -> webview delivered");
      }
    } catch (err) {
      aiLog("[EXT] onDidReceiveMessage handler error:", err && err.message);
      panel.webview.postMessage({ type: "aiReply", value: `Error: ${err && err.message}` });
      panel.webview.postMessage({ type: "aiTyping", value: false });
    }
  });
}

/* -------------------------
   Webview HTML (chat UI)
   ------------------------- */
function getChatHtml(webview, extensionUri) {
  // optional: load your style.css if present
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "src", "webview", "style.css"));

  // Return a template literal containing the page.
  // Note: regex for code blocks is /```([\s\S]*?)```/  (no over-escaping).
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>AI Assistant</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial; background:#0b1220; color:#dfe7ef; }
    .container { display:flex; flex-direction:column; height:100vh; }
    .header { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.02); display:flex; align-items:center; gap:12px; }
    .main { flex:1; overflow:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
    .bubbles { display:flex; flex-direction:column; gap:8px; }
    .bubble { max-width:78%; padding:10px 12px; border-radius:10px; line-height:1.35; white-space:pre-wrap; word-break:break-word; }
    .user { align-self:flex-end; background:#073054; color:#cfe7ff; border-bottom-right-radius:4px; }
    .ai { align-self:flex-start; background:#0f2a37; color:#e9f6ff; border-bottom-left-radius:4px; }
    pre { background:#071322; padding:10px; border-radius:8px; overflow:auto; margin-top:8px; }
    .inputBar { display:flex; gap:8px; padding:12px; border-top:1px solid rgba(255,255,255,0.03); }
    .txt { flex:1; min-height:36px; max-height:140px; padding:10px; background:#061422; color:#e6eef6; border-radius:8px; border:1px solid rgba(255,255,255,0.03); outline:none; resize:none; font-size:13px; }
    .sendBtn { background:#0b5cff; color:white; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; }
    .typing { font-style:italic; color:#95a5b0; font-size:12px; margin:6px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-weight:600">AI Code Assistant (Mock)</div>
      <div style="margin-left:auto;font-size:12px;color:#9aa6b2">Status: <strong>Connected</strong></div>
    </div>

    <div class="main">
      <div id="messages" class="bubbles"></div>
    </div>

    <div class="inputBar">
      <textarea id="input" class="txt" placeholder="Ask a question or paste some code..."></textarea>
      <button id="send" class="sendBtn">Send</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function appendBubble(rawText, who) {
  const el = document.createElement('div');
  el.className = 'bubble ' + (who === 'user' ? 'user' : 'ai');
  el.textContent = rawText; // ✅ Just show plain text, no code parsing
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      appendBubble(text, 'user');
      vscode.postMessage({ type: 'userMessage', text });
      input.value = '';
    }

    // Receive messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'aiTyping') {
        // show typing indicator when true; remove when false
        if (msg.value) {
          const t = document.createElement('div');
          t.id = '__typing_indicator';
          t.className = 'typing ai';
          t.textContent = 'AI is typing...';
          messages.appendChild(t);
          messages.scrollTop = messages.scrollHeight;
        } else {
          const t = document.getElementById('__typing_indicator');
          if (t) t.remove();
        }
      } else if (msg.type === 'aiReply') {
        // remove typing indicator then append
        const t = document.getElementById('__typing_indicator');
        if (t) t.remove();
        appendBubble(msg.value, 'ai');
      }
    });

    // initial welcome
    appendBubble('Hello — I am your mock AI assistant. Ask me about code or functions.', 'ai');
  </script>
</body>
</html>`;
}

/* -------------------------
   Exports
   ------------------------- */
module.exports = {
  activate,
  deactivate
};
