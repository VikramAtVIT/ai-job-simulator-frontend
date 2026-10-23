const socket = io();
let currentUser = null;
let currentScenario = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupSocketListeners();
});

// Socket.io Listeners
function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('? Connected to server');
  });

  socket.on('scenarioStarted', (data) => {
    console.log('?? Scenario started:', data.type);
    currentScenario = data.type;
    
    // Update scenario label
    const scenarioLabel = document.getElementById('scenarioLabel');
    if (scenarioLabel) {
      scenarioLabel.textContent = data.type.replace(/_/g, ' ').toUpperCase();
    }
    
    // Add intro message to chat
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      const introMsg = document.createElement('div');
      introMsg.className = 'message bot';
      introMsg.innerHTML = `<div class="message-bubble">${data.intro}</div>`;
      chatMessages.appendChild(introMsg);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  socket.on('aiResponse', (data) => {
    console.log('?? AI Response:', data.message);
    
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      const msg = document.createElement('div');
      msg.className = 'message bot';
      msg.innerHTML = `<div class="message-bubble">${data.message}</div>`;
      chatMessages.appendChild(msg);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  socket.on('feedbackGenerated', (data) => {
    console.log('?? Feedback:', data.feedback);
    displayFeedback(data.feedback);
  });

  socket.on('error', (message) => {
    console.error('? Socket error:', message);
    alert('Error: ' + message);
  });
}

// Start Scenario Function
function selectScenario(type) {
  console.log('?? Starting scenario:', type);
  
  if (!type) {
    console.error('? Scenario type is undefined!');
    alert('Error: Scenario type not specified');
    return;
  }

  currentScenario = type;
  console.log('?? Emitting selectScenario with:', { scenarioType: type });
  
  socket.emit('selectScenario', {
    scenarioType: type
  });
}

// Send Message Function
function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message) {
    console.warn('?? Empty message');
    return;
  }

  console.log('?? Sending message:', message);
  console.log('Current scenario:', currentScenario);

  // Display user message
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="message-bubble">${message}</div>`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } else {
    console.error('? chatMessages div not found!');
  }

  // Send to server
  socket.emit('message', {
    userId: currentUser?.id || socket.id,
    scenarioType: currentScenario,
    message: message
  });

  input.value = '';
  input.focus();
}

// Feedback Display
function displayFeedback(feedback) {
  console.log('Displaying feedback:', feedback);
  
  const scoreElement = document.getElementById('feedbackScore');
  if (scoreElement) scoreElement.textContent = feedback.score;

  const commElement = document.getElementById('rubricComm');
  if (commElement) commElement.textContent = `${feedback.rubrics['Communication']}/25`;

  const problemElement = document.getElementById('rubricProblem');
  if (problemElement) problemElement.textContent = `${feedback.rubrics['Problem Solving']}/25`;

  const profElement = document.getElementById('rubricProf');
  if (profElement) profElement.textContent = `${feedback.rubrics['Professionalism']}/25`;

  const adaptElement = document.getElementById('rubricAdapt');
  if (adaptElement) adaptElement.textContent = `${feedback.rubrics['Adaptability']}/25`;

  const feedbackText = document.getElementById('feedbackText');
  if (feedbackText) {
    if (feedback.score >= 80) {
      feedbackText.textContent = '?? Excellent performance! You demonstrated strong communication and problem-solving skills.';
    } else if (feedback.score >= 60) {
      feedbackText.textContent = '?? Good effort! Work on expanding your responses and considering stakeholder impacts.';
    } else {
      feedbackText.textContent = '?? Keep practicing! Focus on asking clarifying questions and providing specific solutions.';
    }
  }
}

// Generate Feedback
function generateFeedback() {
  console.log('?? Requesting feedback...');
  socket.emit('generateFeedback', {
    userId: currentUser?.id || socket.id,
    scenarioType: currentScenario
  });
}

// Handle chat input keypress
function handleChatKeypress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

// Authentication
function checkAuth() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = '/login.html';
  } else {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    currentUser = user;
  }
}

// Utility Functions
function showNotifications() {
  alert('No new notifications');
}

function toggleProfileMenu() {
  alert('Profile menu');
}

function toggleVoiceRecording() {
  alert('Voice recording not yet implemented');
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  window.location.href = '/login.html';
}
