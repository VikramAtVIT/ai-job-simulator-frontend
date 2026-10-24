let currentUser = null;
let currentScenario = null;
let pendingScenario = null;
let voiceRecognition = null;
let voiceStartedAt = 0;
let voiceTranscript = '';
let voiceInterimTranscript = '';
let voiceConfidence = 0;
let voiceIsRecording = false;
let voiceRestartTimeout = null;
let lastScenarioOpening = '';

const scenarioLabels = {
  manager_review: 'Manager performance review',
  client_requirement: 'Client requirement discussion',
  production_incident: 'Production incident',
  difficult_colleague: 'Difficult colleague',
  daily_standup: 'Daily standup update',
  priority_conflict: 'Priority conflict resolution'
};

const scenarioIntros = {
  manager_review: 'Welcome to your performance review. Start by sharing one result you are proud of and the impact it had.',
  client_requirement: 'Welcome to the client requirements discussion. Start by asking the most important question before proposing a solution.',
  production_incident: 'You are leading a live production incident. Start by explaining how you would assess impact and stabilize the service safely.',
  difficult_colleague: 'Your teammate disagrees with your approach. Explain your position and show how you would keep the conversation constructive.',
  daily_standup: 'Welcome to today’s standup. Share what you completed, what you will do next, and any blocker.',
  priority_conflict: 'Two stakeholders need urgent work. Explain how you would compare impact, urgency, and dependencies before prioritizing.'
};

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  window.socket = io(window.APP_CONFIG.backendUrl, {
    auth: {
      userId: localStorage.getItem('userId') || ''
    }
  });
  setupSocketListeners();
  if (localStorage.getItem('authToken')) {
    router.navigate('dashboard');
  }
});

function setupSocketListeners() {
  if (!window.socket) return;
  window.socket.on('userStats', updateUserStats);
  window.socket.on('feedbackGenerated', data => {
    displayFeedback(data.feedback);
  });
  window.socket.on('scenarioStarted', data => {
    currentScenario = data.type;
    if (data.intro !== lastScenarioOpening) {
      appendMessage(data.intro, 'bot');
    }
  });
  window.socket.on('aiResponse', data => appendMessage(data.message, 'bot'));
  window.socket.on('voiceAnalysis', data => {
    const analysis = document.getElementById('voiceAnalysis');
    if (!analysis) return;
    analysis.textContent = `${data.feedback} ${data.duration}s • ${data.confidence}% confidence`;
    updateVoiceStatus('Voice response sent.');
  });
  window.socket.on('error', message => console.error('Socket error:', message));
}

function updateUserStats(stats) {
  localStorage.setItem('userStats', JSON.stringify(stats));
  const values = {
    completedCount: stats.completedScenarios,
    avgScore: `${stats.averageScore}%`,
    currentLevel: stats.currentLevel,
    totalAttempts: stats.totalAttempts
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
}

function generateFeedback() {
  if (!currentScenario) {
    appendMessage('Select a scenario and complete a response before requesting feedback.', 'bot');
    return;
  }
  window.socket.emit('generateFeedback', { scenarioType: currentScenario });
}

function displayFeedback(feedback) {
  const values = {
    feedbackScore: feedback.score,
    rubricComm: `${feedback.rubrics.Communication}/25`,
    rubricProblem: `${feedback.rubrics['Problem Solving']}/25`,
    rubricProf: `${feedback.rubrics.Professionalism}/25`,
    rubricAdapt: `${feedback.rubrics.Adaptability}/25`
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const feedbackText = document.getElementById('feedbackText');
  if (feedbackText) {
    feedbackText.textContent = feedback.score >= 80
      ? 'Strong performance. Keep using specific evidence and clear next steps.'
      : 'Good practice session. Focus on specific examples, trade-offs, and measurable outcomes.';
  }
}

function checkAuth() {
  const token = localStorage.getItem('authToken');
  if (!token && !window.location.href.includes('login')) {
    window.location.href = './login.html';
  }
  if (token) {
    try {
      currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    } catch (error) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.href = './login.html';
    }
  }
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('userStats');
  window.location.href = './login.html';
}

function handleLogout() {
  logout();
}

function startScenario(type) {
  pendingScenario = type;
  router.navigate('dashboard');
}

function showNotifications() {
  window.alert('You are all caught up.');
}

function toggleProfileMenu() {
  window.alert(`Signed in as ${currentUser && currentUser.email ? currentUser.email : 'User'}`);
}

const router = {
  navigate(page) {
    fetch(`./pages/${page}.html`)
      .then(r => {
        if (!r.ok) throw new Error(`Unable to load ${page}`);
        return r.text();
      })
      .then(html => {
        document.getElementById('main-content').innerHTML = html;
        attachPageHandlers();
      })
      .catch(err => console.error(err));
  }
};

function attachPageHandlers() {
  const chatMessages = document.getElementById('chatMessages');

  document.querySelectorAll('[data-scenario]').forEach(button => {
    button.addEventListener('click', () => selectScenario(button.dataset.scenario));
  });

  if (chatMessages) {
    const scenarioToSelect = pendingScenario || currentScenario;
    pendingScenario = null;
    if (scenarioToSelect) selectScenario(scenarioToSelect);

    const input = document.getElementById('chatInput');
    if (input) {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') sendMessage();
      });
    }
    initializeVoiceChat();
  }
}

function initializeVoiceChat() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceButton = document.getElementById('voiceBtn');
  if (!voiceButton || !SpeechRecognition) {
    updateVoiceStatus('Voice input is not supported in this browser.');
    if (voiceButton) voiceButton.disabled = true;
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.lang = 'en-US';
  voiceRecognition.onstart = () => {
    if (!voiceIsRecording) {
      voiceStartedAt = Date.now();
      voiceTranscript = '';
      voiceInterimTranscript = '';
      voiceConfidence = 0;
    }
    voiceIsRecording = true;
    setVoiceRecordingState(true);
  };
  voiceRecognition.onresult = event => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) {
        voiceTranscript += `${result[0].transcript} `;
        voiceConfidence = Math.max(voiceConfidence, Math.round((result[0].confidence || 0) * 100));
      } else {
        interim += result[0].transcript;
      }
    }
    voiceInterimTranscript = interim;
    updateVoiceTranscript(`${voiceTranscript}${voiceInterimTranscript}`.trim());
  };
  voiceRecognition.onerror = event => {
    if (event.error === 'no-speech' && voiceIsRecording) {
      updateVoiceStatus('Still listening... please continue speaking.');
      return;
    }

    voiceIsRecording = false;
    setVoiceRecordingState(false);
    updateVoiceStatus(event.error === 'not-allowed'
      ? 'Microphone permission was denied. Allow microphone access and try again.'
      : `Voice input error: ${event.error}`);
  };
  voiceRecognition.onend = () => {
    if (voiceIsRecording) {
      updateVoiceStatus('Still listening... please continue speaking.');
      voiceRestartTimeout = window.setTimeout(() => {
        if (!voiceIsRecording) return;
        try {
          voiceRecognition.start();
        } catch (error) {
          if (error.name !== 'InvalidStateError') {
            voiceIsRecording = false;
            setVoiceRecordingState(false);
            updateVoiceStatus('Voice input could not be restarted. Try again.');
          }
        }
      }, 250);
      return;
    }

    const completedTranscript = `${voiceTranscript} ${voiceInterimTranscript}`.trim();
    voiceTranscript = completedTranscript;
    voiceInterimTranscript = '';
    updateVoiceTranscript(completedTranscript);
    if (completedTranscript) {
      document.getElementById('sendVoiceBtn').disabled = false;
      updateVoiceStatus('Transcript ready to send.');
    } else {
      updateVoiceStatus('No speech detected.');
    }
  };
}

function toggleVoiceRecording() {
  if (!voiceRecognition) return;
  if (document.getElementById('voiceBtn').getAttribute('aria-pressed') === 'true') {
    voiceIsRecording = false;
    if (voiceRestartTimeout) window.clearTimeout(voiceRestartTimeout);
    voiceRecognition.stop();
    return;
  }
  if (!currentScenario) {
    updateVoiceStatus('Select a scenario before recording.');
    return;
  }
  document.getElementById('sendVoiceBtn').disabled = true;
  updateVoiceTranscript('');
  try {
    voiceRecognition.start();
  } catch (error) {
    if (error.name === 'InvalidStateError') {
      updateVoiceStatus('Voice input is already starting. Please wait.');
      return;
    }
    updateVoiceStatus('Unable to start voice input. Check microphone permissions.');
  }
}

function setVoiceRecordingState(isRecording) {
  const button = document.getElementById('voiceBtn');
  const label = document.getElementById('voiceButtonLabel');
  if (!button || !label) return;
  button.setAttribute('aria-pressed', String(isRecording));
  button.classList.toggle('recording', isRecording);
  label.textContent = isRecording ? 'Stop recording' : 'Start recording';
  updateVoiceStatus(isRecording ? 'Listening...' : 'Ready');
}

function updateVoiceStatus(message) {
  const status = document.getElementById('voiceStatus');
  if (status) status.textContent = message;
}

function updateVoiceTranscript(transcript) {
  const element = document.getElementById('voiceTranscript');
  if (element) {
    element.textContent = transcript || 'Your transcript will appear here.';
    element.classList.toggle('has-transcript', Boolean(transcript));
  }
}

function sendVoiceMessage() {
  const transcript = voiceTranscript.trim();
  if (!transcript || !currentScenario) return;

  appendMessage(transcript, 'user');
  window.socket.emit('voiceMessage', {
    transcript,
    duration: (Date.now() - voiceStartedAt) / 1000,
    confidence: voiceConfidence
  });
  document.getElementById('sendVoiceBtn').disabled = true;
  updateVoiceStatus('Sending voice response...');
}

function selectScenario(type) {
  currentScenario = type;
  document.querySelectorAll('[data-scenario]').forEach(button => {
    const isSelected = button.dataset.scenario === type;
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  const scenarioLabel = document.getElementById('selectedScenario');
  if (scenarioLabel) {
    scenarioLabel.textContent = `Selected: ${scenarioLabels[type] || type}`;
  }

  lastScenarioOpening = scenarioIntros[type];
  appendMessage(lastScenarioOpening, 'bot');
  window.socket.emit('selectScenario', { scenarioType: type });
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input && input.value.trim();
  if (!message || !currentScenario) return;

  appendMessage(message, 'user');
  input.value = '';
  window.socket.emit('message', { scenarioType: currentScenario, message });
}

function appendMessage(message, sender) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const element = document.createElement('p');
  element.className = sender;
  element.textContent = message;
  chatMessages.appendChild(element);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
