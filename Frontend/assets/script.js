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