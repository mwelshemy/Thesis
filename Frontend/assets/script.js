<<<<<<< HEAD
// assets/script.js

// ===== DOM ELEMENTS =====
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const fileUpload = document.getElementById('file-upload');
const zipUpload = document.getElementById('zip-upload');
const uploadFilename = document.getElementById('upload-filename');
const uploadClearBtn = document.getElementById('upload-clear');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarContainer = document.getElementById('sidebar-container');

// ===== STATE VARIABLES =====
let uploadedFileContent = null;
let uploadedZipFile = null;
let conversationHistory = JSON.parse(localStorage.getItem('conversationHistory')) || [
  { title: "Conversation #1", preview: "How do I convert Python to JS?" },
  { title: "Conversation #2", preview: "Suggest improvements for my code." }
];

// ===== DROPDOWN UPLOAD UI LOGIC =====
document.querySelector('.dropdown-btn').addEventListener('click', function (e) {
  e.stopPropagation();
  document.querySelector('.dropdown-content').classList.toggle('show');
});

document.body.addEventListener('click', function () {
  document.querySelector('.dropdown-content').classList.remove('show');
});

// ===== FILE UPLOAD LOGIC =====
fileUpload.addEventListener('change', function () {
  if (fileUpload.files && fileUpload.files[0]) {
    const file = fileUpload.files[0];
    uploadFilename.textContent = file.name;
    uploadClearBtn.style.display = '';
    uploadedZipFile = null;
    
    const reader = new FileReader();
    reader.onload = function (e) {
      uploadedFileContent = e.target.result;
      addMessage(`Uploaded file: ${file.name}`, 'user');
      addMessage("I see you've uploaded a file. How can I help you with it?", 'bot');
    };
    reader.readAsText(file);
  }
  document.querySelector('.dropdown-content').classList.remove('show');
});

zipUpload.addEventListener('change', function () {
  if (zipUpload.files && zipUpload.files[0]) {
    const file = zipUpload.files[0];
    uploadFilename.textContent = file.name;
    uploadClearBtn.style.display = '';
    uploadedFileContent = null;
    uploadedZipFile = file;
    
    // Send the ZIP file to the backend
    uploadFileToBackend(file);
  }
  document.querySelector('.dropdown-content').classList.remove('show');
});

uploadClearBtn.addEventListener('click', function () {
  fileUpload.value = '';
  zipUpload.value = '';
  uploadFilename.textContent = '';
  uploadedFileContent = null;
  uploadedZipFile = null;
  uploadClearBtn.style.display = 'none';
  addMessage("Cleared uploaded files", 'bot');
});

// ===== BACKEND INTEGRATION =====
async function uploadFileToBackend(file) {
  addMessage(`Uploading ${file.name}...`, 'user');
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await fetch('https://localhost:7000/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok) {
      addMessage(`File "${file.name}" uploaded successfully. ${result.message}`, 'bot');
    } else {
      addMessage(`Upload failed: ${result.error}`, 'bot');
    }
  } catch (error) {
    console.error('Upload error:', error);
    addMessage('Upload failed: Network error. Please try again.', 'bot');
  }
}

async function sendMessageToBackend(message) {
  try {
    // Simulate API call - replace with your actual backend endpoint
    const response = await fetch('https://localhost:7000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: message })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.response;
    } else {
      return "I'm having trouble connecting to the server. Please try again later.";
    }
  } catch (error) {
    console.error('Chat error:', error);
    return "I'm experiencing connection issues. Please check your internet connection.";
  }
}

// ===== CHAT LOGIC =====
function addMessage(text, sender) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  
  const avatarDiv = document.createElement('div');
  avatarDiv.className = `avatar ${sender}-avatar`;
  
  const img = document.createElement('img');
  img.src = sender === 'user' ? 'Images/user.png' : 'Images/bot.png';
  img.alt = sender === 'user' ? 'User Icon' : 'Bot Icon';
  
  avatarDiv.appendChild(img);
  
  const textDiv = document.createElement('div');
  textDiv.className = 'text';
  textDiv.textContent = text;
  
  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(textDiv);
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Update conversation history
  if (sender === 'user') {
    updateConversationHistory(text);
  }
}

if (chatForm) {
  chatForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    // Add user message to chat
    addMessage(userMessage, 'user');
    chatInput.value = '';

    // Get AI response
    try {
      const aiResponse = await sendMessageToBackend(userMessage);
      addMessage(aiResponse, 'bot');
    } catch (error) {
      console.error('Error getting AI response:', error);
      addMessage("I'm having trouble processing your request. Please try again.", 'bot');
    }
  });
}

// ===== SIDEBAR LOGIC =====
function loadSidebar() {
  // Create sidebar content dynamically
  const sidebarHTML = `
    <div class="sidebar">
      <button id="sidebar-close" class="sidebar-close">×</button>
      <div class="sidebar-header">
        <h3>Conversation History</h3>
      </div>
      <div id="sidebar-content" class="sidebar-content"></div>
      <div class="sidebar-footer">
        <button id="clear-history" class="btn-clear">Clear History</button>
      </div>
    </div>
  `;
  
  sidebarContainer.innerHTML = sidebarHTML;
  document.getElementById('sidebar-close').onclick = closeSidebar;
  document.getElementById('clear-history').onclick = clearHistory;
  
  renderConversations();
}

function openSidebar() {
  loadSidebar();
  sidebarContainer.classList.add('open');
  document.body.classList.add('sidebar-open');
}

function closeSidebar() {
  sidebarContainer.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

if (sidebarToggle) {
  sidebarToggle.onclick = openSidebar;
}

// ===== CONVERSATION HISTORY MANAGEMENT =====
function updateConversationHistory(message) {
  // Get current conversation messages
  const userMessages = Array.from(chatMessages.querySelectorAll('.message.user .text'));
  const lastFewMessages = userMessages.slice(-3).map(msg => msg.textContent).join(' | ');
  
  // Update the current conversation preview
  if (conversationHistory.length > 0) {
    conversationHistory[0].preview = lastFewMessages.slice(0, 50) + (lastFewMessages.length > 50 ? '...' : '');
  } else {
    conversationHistory.unshift({
      title: `Conversation #${conversationHistory.length + 1}`,
      preview: lastFewMessages.slice(0, 50) + (lastFewMessages.length > 50 ? '...' : '')
    });
  }
  
  // Save to localStorage
  localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
  
  // Update sidebar if open
  if (sidebarContainer.classList.contains('open')) {
    renderConversations();
  }
}

function renderConversations() {
  const sidebarContent = document.getElementById('sidebar-content');
  if (!sidebarContent) return;
  
  sidebarContent.innerHTML = "";
  
  if (conversationHistory.length === 0) {
    sidebarContent.innerHTML = '<p class="no-conversations">No conversations yet</p>';
    return;
  }
  
  // Current conversation (most recent)
  const currentConv = conversationHistory[0];
  sidebarContent.innerHTML += `
    <div class="conversation-entry active">
      <div class="conversation-title">${currentConv.title}</div>
      <div class="conversation-preview">${currentConv.preview}</div>
    </div>
  `;
  
  // Older conversations
  for (let i = 1; i < conversationHistory.length; i++) {
    const conv = conversationHistory[i];
    sidebarContent.innerHTML += `
      <div class="conversation-entry">
        <div class="conversation-title">${conv.title}</div>
        <div class="conversation-preview">${conv.preview}</div>
      </div>
    `;
  }
}

function clearHistory() {
  conversationHistory = [];
  localStorage.removeItem('conversationHistory');
  renderConversations();
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
  // Load any saved conversation history
  const savedHistory = localStorage.getItem('conversationHistory');
  if (savedHistory) {
    conversationHistory = JSON.parse(savedHistory);
  }
  
  // Initialize the chat with a welcome message if it's empty
  if (chatMessages.children.length <= 1) {
    setTimeout(() => {
      addMessage("Welcome to CodeLingo! I can help you with code retrieval, conversion between programming languages, and code improvements. Try uploading a ZIP file or asking a question!", 'bot');
    }, 500);
  }
});

// ===== UTILITY FUNCTIONS =====
function getCurrentConversationPreview() {
  const userMessages = Array.from(chatMessages.querySelectorAll('.message.user .text'));
  if (userMessages.length === 0) return "No conversation yet.";
  
  const lastMessage = userMessages[userMessages.length - 1].textContent;
  return lastMessage.length > 50 ? lastMessage.substring(0, 50) + '...' : lastMessage;
}

// Handle Enter key for submission, but allow Shift+Enter for new lines
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Close sidebar when clicking outside of it
document.addEventListener('click', function(e) {
  if (sidebarContainer.classList.contains('open') && 
      !sidebarContainer.contains(e.target) && 
      e.target !== sidebarToggle) {
    closeSidebar();
  }
});
=======
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');



const userDiv = document.createElement('div');
userDiv.className = 'message user';
userDiv.innerHTML = `
  <div class="avatar user-avatar">
    <img src="https://avatars.githubusercontent.com/u/9919?s=200&v=4" alt="User Icon">
  </div>
  <div class="text">${userMessage}</div>
`;
chatMessages.appendChild(userDiv);

const aiDiv = document.createElement('div');
aiDiv.className = 'message bot';
aiDiv.innerHTML = `
  <div class="avatar bot-avatar">
    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6e/OpenAI_Logo.svg" alt="Bot Icon">
  </div>
  <div class="text">${getAIResponse(userMessage)}</div>
`;
chatMessages.appendChild(aiDiv);
>>>>>>> 58f9a436dbdee2274d5c1204cd8c681f427425bd
