document.addEventListener('DOMContentLoaded', initializeApp);

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
const uploadStatus = document.getElementById('upload-status');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// ===== STATE VARIABLES =====
let uploadedFileContent = null;
let uploadedZipFile = null;
let conversationHistory = [];
let projectID = null;

// ===== INITIALIZATION =====
function initializeApp() {
  loadConversationHistory();
  initializeSidebar();
  initializeEventListeners();

  if (chatMessages.children.length <= 1) {
    setTimeout(() => {
      addMessage("Welcome to CodeLingo! Ask a question or upload a file to get started.", 'bot');
    }, 500);
  }
}

function initializeEventListeners() {
  chatForm.addEventListener('submit', handleChatSubmit);

  sidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  document.querySelector('.dropdown-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.dropdown-content').classList.toggle('show');
  });

  document.addEventListener('click', () => {
    document.querySelector('.dropdown-content').classList.remove('show');
    if (sidebarContainer.classList.contains('open')) {
      closeSidebar();
    }
  });

  sidebarContainer.addEventListener('click', (e) => e.stopPropagation());

  fileUpload.addEventListener('change', handleFileUpload);
  zipUpload.addEventListener('change', handleZipUpload);
  uploadClearBtn.addEventListener('click', clearUploads);

  if (searchForm) {
    searchForm.addEventListener('submit', handleSearchSubmit);
  }
}

// ===== CHAT LOGIC =====
async function handleChatSubmit(e) {
  e.preventDefault();
  const userMessage = chatInput.value.trim();
  if (!userMessage) return;

  addMessage(userMessage, 'user');
  updateConversationHistory(userMessage);
  chatInput.value = '';

  try {
    const aiResponse = await sendMessageToBackend(userMessage);
    addMessage(aiResponse, 'bot');
  } catch (error) {
    console.error('Error getting AI response:', error);
    addMessage("I'm having trouble processing your request. Please try again.", 'bot');
  }
}

function addMessage(text, sender) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;

  const avatarSrc = sender === 'user' ? 'Images/user.png' : 'Images/bot.png';
  messageDiv.innerHTML = `
    <div class="avatar ${sender}-avatar">
      <img src="${avatarSrc}" alt="${sender} Icon">
    </div>
    <div class="text"></div>`;

  messageDiv.querySelector('.text').textContent = text;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ===== SIDEBAR LOGIC =====
function initializeSidebar() {
  const sidebarHTML = `
    <div class="sidebar">
      <div class="sidebar-header">
        <h3>Conversation History</h3>
        <button id="sidebar-close" class="sidebar-close" aria-label="Close sidebar">×</button>
      </div>
      <div id="sidebar-content" class="sidebar-content"></div>
      <div class="sidebar-footer">
        <button id="clear-history" class="btn-clear">Clear History</button>
      </div>
    </div>
  `;
  sidebarContainer.innerHTML = sidebarHTML;
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
  document.getElementById('clear-history').addEventListener('click', clearHistory);
  renderConversations();
}

function toggleSidebar() {
  const isOpen = sidebarContainer.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function openSidebar() {
  renderConversations();
  sidebarContainer.classList.add('open');
  document.body.classList.add('sidebar-open');
}

function closeSidebar() {
  sidebarContainer.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

// ===== CONVERSATION HISTORY MANAGEMENT =====
function loadConversationHistory() {
  conversationHistory = JSON.parse(localStorage.getItem('conversationHistory')) || [];
}

function updateConversationHistory(message) {
  if (conversationHistory.length === 0) {
    conversationHistory.unshift({
      title: `Conversation #1`,
      preview: ''
    });
  }

  const preview = message.length > 40 ? message.substring(0, 40) + '...' : message;
  conversationHistory[0].preview = preview;
  localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
  if (sidebarContainer.classList.contains('open')) {
    renderConversations();
  }
}

function renderConversations() {
  const sidebarContent = document.getElementById('sidebar-content');
  if (!sidebarContent) return;

  if (conversationHistory.length === 0) {
    sidebarContent.innerHTML = '<p class="no-conversations">No conversations yet</p>';
    return;
  }

  sidebarContent.innerHTML = conversationHistory.map((conv, index) => `
    <div class="conversation-entry ${index === 0 ? 'active' : ''}">
      <div class="conversation-title">${conv.title}</div>
      <div class="conversation-preview">${conv.preview}</div>
    </div>
  `).join('');
}

function clearHistory() {
  conversationHistory = [];
  localStorage.removeItem('conversationHistory');
  const initialBotMessage = chatMessages.querySelector('.message.bot');
  chatMessages.innerHTML = '';
  if (initialBotMessage) {
    chatMessages.appendChild(initialBotMessage);
  }
  addMessage("History cleared.", 'bot');
  renderConversations();
}

// ===== FILE UPLOAD LOGIC =====
function handleFileUpload() {
  const file = fileUpload.files[0];
  if (!file) return;

  uploadFilename.textContent = file.name;
  uploadClearBtn.style.display = 'inline-block';
  uploadedZipFile = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedFileContent = e.target.result;
    addMessage(`Uploaded file: ${file.name}`, 'user');
    addMessage("I see you've uploaded a file. How can I help with it?", 'bot');
  };
  reader.readAsText(file);
  document.querySelector('.dropdown-content').classList.remove('show');
}

function handleZipUpload() {
  const file = zipUpload.files[0];
  if (!file) return;

  uploadFilename.textContent = file.name;
  uploadClearBtn.style.display = 'inline-block';
  uploadedFileContent = null;
  uploadedZipFile = file;
  uploadFileToBackend(file);
  document.querySelector('.dropdown-content').classList.remove('show');
}

function clearUploads() {
  fileUpload.value = '';
  zipUpload.value = '';
  uploadFilename.textContent = '';
  uploadedFileContent = null;
  uploadedZipFile = null;
  showStatus("", "");
  uploadClearBtn.style.display = 'none';
  addMessage("Cleared uploaded file.", 'bot');
}

// ===== BACKEND INTEGRATION =====
async function uploadFileToBackend(file) {
  showStatus(`<span class="spinner"></span>Uploading ${file.name}...`, "loading");
  addMessage(`Uploading ${file.name}...`, 'user');
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('http://localhost:5231/api/upload', {
      method: 'POST',
      body: formData
    });
    const result = await response.json();

    if (response.ok && result.projectID) {
      projectID = result.projectID;
      showStatus(`Upload successful! Project ID: ${projectID}`, "success");
      addMessage(`File "${file.name}" processed. Project ID: ${projectID}`, 'bot');
    } else {
      showStatus(result.error || result.Message || "Upload failed.", "error");
      addMessage(`Upload failed: ${result.error || result.Message || "Unknown error."}`, 'bot');
    }
  } catch (error) {
    console.error('Upload error:', error);
    showStatus("Upload failed due to a network error.", "error");
    addMessage('Upload failed due to a network error. Please try again.', 'bot');
  }
}

function showStatus(message, type) {
  uploadStatus.textContent = "";
  uploadStatus.className = "status";
  if (!message) {
    uploadStatus.style.display = "none";
    return;
  }
  uploadStatus.innerHTML = message;
  uploadStatus.style.display = "block";
  if (type) uploadStatus.classList.add(type);
}

async function sendMessageToBackend(message) {
  try {
    const response = await fetch('http://localhost:5231/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });

    if (!response.ok) {
      return "I'm having trouble connecting to the server. Please try again later.";
    }
    const data = await response.json();
    return data.response || data.Message || "No valid response from server.";

  } catch (error) {
    console.error('Chat error:', error);
    return "I'm experiencing connection issues. Please check your network.";
  }
}

// ===== SEARCH INTEGRATION =====
async function handleSearchSubmit(e) {
  e.preventDefault();
  searchResults.className = "search-results";
  if (!projectID) {
    searchResults.textContent = "You must upload a ZIP project before searching!";
    searchResults.classList.add("error");
    return;
  }
  const keyword = searchInput.value.trim();
  if (!keyword) {
    searchResults.textContent = "Please enter a keyword to search.";
    searchResults.classList.add("error");
    return;
  }
  searchResults.innerHTML = `<span class="spinner"></span>Searching...`;
  searchResults.classList.add("loading");

  try {
    const response = await fetch(
      `http://localhost:5231/api/search?projectID=${encodeURIComponent(projectID)}&keyword=${encodeURIComponent(keyword)}`
    );
    const data = await response.json();
    if (response.ok) {
      searchResults.textContent = JSON.stringify(data, null, 2);
      searchResults.classList.remove("loading");
      searchResults.classList.add("success");
    } else {
      searchResults.textContent = data.error || "Search failed.";
      searchResults.classList.remove("loading");
      searchResults.classList.add("error");
    }
  } catch (error) {
    searchResults.textContent = "Search failed due to a network error.";
    searchResults.classList.remove("loading");
    searchResults.classList.add("error");
  }
}