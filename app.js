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
let latestStats = null;
let latestRecommendation = '';

const defaultPreferences = { theme: 'dark', hardScenarios: true };

function getPreferences() {
  try {
    return { ...defaultPreferences, ...JSON.parse(localStorage.getItem('appPreferences') || '{}') };
  } catch (error) {
    localStorage.removeItem('appPreferences');
    return { ...defaultPreferences };
  }
}

function savePreferences(preferences) {
  localStorage.setItem('appPreferences', JSON.stringify(preferences));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('.theme-toggle-label').forEach(element => {
    element.textContent = theme === 'light' ? 'Light mode' : 'Dark mode';
  });
  document.querySelectorAll('.theme-icon').forEach(element => {
    element.textContent = theme === 'light' ? '☀' : '☾';
  });
}

function setTheme(theme) {
  const preferences = getPreferences();
  preferences.theme = theme;
  savePreferences(preferences);
  applyTheme(theme);
  applyPreferences();
}

function toggleTheme() {
  setTheme(getPreferences().theme === 'light' ? 'dark' : 'light');
}

function setPreference(name, value) {
  const preferences = getPreferences();
  preferences[name] = value;
  savePreferences(preferences);
  applyPreferences();
}

function applyPreferences() {
  const preferences = getPreferences();
  applyTheme(preferences.theme);
  document.querySelectorAll('[data-hard="true"]').forEach(element => {
    const unlocked = !latestStats || latestStats.hardScenariosUnlocked;
    element.hidden = !preferences.hardScenarios && unlocked;
    element.classList.toggle('locked-scenario', !unlocked);
    element.setAttribute('aria-disabled', String(!unlocked));
  });
  document.querySelectorAll('.difficulty.hard').forEach(element => {
    const card = element.closest('.scenario-card');
    if (card) {
      const unlocked = !latestStats || latestStats.hardScenariosUnlocked;
      card.hidden = !preferences.hardScenarios && unlocked;
      card.classList.toggle('locked-scenario', !unlocked);
    }
  });
  const lightModeToggle = document.getElementById('lightModeToggle');
  const hardScenariosToggle = document.getElementById('hardScenariosToggle');
  if (lightModeToggle) lightModeToggle.checked = preferences.theme === 'light';
  if (hardScenariosToggle) hardScenariosToggle.checked = preferences.hardScenarios;
}

function consumeGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const authToken = params.get('authToken');
  const userId = params.get('userId');
  const user = params.get('user');
  if (!authToken || !userId || !user) return;
  try {
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('userId', userId);
    localStorage.setItem('currentUser', user);
    localStorage.removeItem('userStats');
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    console.error('Unable to complete Google sign-in:', error);
  }
}

const scenarioLabels = {
  manager_review: 'Manager performance review',
  client_requirement: 'Client requirement discussion',
  production_incident: 'Production incident',
  difficult_colleague: 'Difficult colleague',
  daily_standup: 'Daily standup update',
  priority_conflict: 'Priority conflict resolution'
};

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getPreferences().theme);
  consumeGoogleRedirect();
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
  window.socket.on('connect', () => updateBackendStatus('online', 'Coach online'));
  window.socket.on('disconnect', () => updateBackendStatus('offline', 'Coach offline'));
  window.socket.on('connect_error', () => updateBackendStatus('offline', 'Coach unavailable'));
  window.socket.on('userStats', updateUserStats);
  window.socket.on('feedbackGenerated', data => {
    displayFeedback(data.feedback);
    if (data.recommendation) {
      updateRecommendation(data.recommendation);
    } else if (typeof data.recommendationError === 'string') {
      showRecommendationStatus(data.recommendationError);
    } else {
      showRecommendationStatus('No skill-gap analysis was returned. Try generating feedback again.');
    }
  });
  window.socket.on('scenarioStarted', data => {
    currentScenario = data.type;
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';
    appendMessage(data.intro, 'bot');
  });
  window.socket.on('aiResponse', data => {
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (message) appendMessage(message, 'bot');
  });
  window.socket.on('voiceAnalysis', data => {
    const feedback = typeof data.feedback === 'string' ? data.feedback.trim() : '';
    if (feedback) {
      appendMessage(`${feedback} (${data.duration}s • ${data.confidence}% confidence)`, 'bot');
    }
    if (!voiceIsRecording && !voiceTranscript) {
      updateVoiceStatus('Response analyzed. Record another when ready.');
    }
  });
  window.socket.on('error', message => console.error('Socket error:', message));
}

function updateBackendStatus(state, label) {
  const status = document.getElementById('backendStatus');
  if (!status) return;
  status.dataset.state = state;
  const labelElement = status.querySelector('.backend-status-label');
  if (labelElement) labelElement.textContent = label;
}

function updateRecommendation(recommendation) {
  if (!recommendation || typeof recommendation !== 'object') return;
  const skill = typeof recommendation.skill === 'string' ? recommendation.skill.trim() : '';
  const evidence = typeof recommendation.evidence === 'string' ? recommendation.evidence.trim() : '';
  const nextStep = typeof recommendation.nextStep === 'string' ? recommendation.nextStep.trim() : '';
  if (!skill || !evidence || !nextStep) return;
  latestRecommendation = `${skill}: ${evidence} Next practice: ${nextStep}`;
  const element = document.getElementById('aiRecommendation');
  if (element) {
    element.textContent = latestRecommendation;
    element.classList.remove('recommendation-empty');
  }
}

function showRecommendationStatus(message) {
  const element = document.getElementById('aiRecommendation');
  if (!element) return;
  element.textContent = message;
  element.classList.add('recommendation-empty');
}

function updateUserStats(stats) {
  latestStats = stats;
  localStorage.setItem('userStats', JSON.stringify(stats));
  updateAchievements(stats);
  updateDashboardSummary(stats);
  const completedScenarios = Number(stats.completedScenarios) || 0;
  const averageScore = Number(stats.averageScore) || 0;
  const values = {
    completedCount: completedScenarios,
    avgScore: `${averageScore}%`,
    currentLevel: stats.currentLevel,
    levelComment: stats.levelComment,
    totalAttempts: Number(stats.totalAttempts) || 0
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element && value !== undefined) element.textContent = value;
  });
  const pageValues = {
    progressAverageScore: `${averageScore}%`,
    progressCompleted: completedScenarios,
    progressAttempts: Number(stats.totalAttempts) || 0,
    progressLevel: stats.currentLevel,
    achievementCount: `${Math.min(stats.completedScenarios, 12)}/12`
  };
  Object.entries(pageValues).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  document.querySelectorAll('[data-scenario]').forEach(item => {
    const progress = stats.scenarioProgress && stats.scenarioProgress[item.dataset.scenario];
    const bar = item.querySelector('.scenario-progress-bar');
    const progressBar = item.querySelector('.progress-bar-inner');
    const fullProgressBar = item.querySelector('.progress-fill');
    const percentage = item.querySelector('.progress-percentage');
    const progressText = item.querySelector('.progress-text');
    const progressMeta = item.querySelector('.progress-meta');
    const attempts = Number(progress && progress.attempts) || 0;
    const rawMastery = Number(progress && progress.mastery);
    const rawBestScore = Number(progress && progress.bestScore);
    const hasMastery = Number.isFinite(rawMastery) && rawMastery >= 0;
    const hasBestScore = Number.isFinite(rawBestScore) && rawBestScore >= 0;
    const hasProgress = attempts > 0 || hasMastery || hasBestScore;
    const mastery = Math.min(100, Math.max(0, hasMastery ? rawMastery : hasBestScore ? rawBestScore : 0));
    const bestScore = hasBestScore ? Math.min(100, Math.max(0, rawBestScore)) : mastery;
    if (bar) {
      bar.style.width = `${mastery}%`;
    }
    if (progressBar) progressBar.style.width = `${mastery}%`;
    if (fullProgressBar) fullProgressBar.style.width = `${mastery}%`;
    if (percentage) percentage.textContent = hasProgress ? `${Math.round(mastery)}%` : '—';
    if (progressText) progressText.textContent = `${mastery}% Mastered`;
    const progressBarContainer = item.querySelector('[role="progressbar"]');
    if (progressBarContainer) progressBarContainer.setAttribute('aria-valuenow', String(Math.round(mastery)));
    if (progressMeta) {
      progressMeta.textContent = hasProgress
        ? `${attempts} attempt${attempts === 1 ? '' : 's'} · Best score ${Math.round(bestScore)}%`
        : 'Not attempted yet';
    }
  });
  updateSkillDevelopment(stats);
  applyPreferences();
}

function updateSkillDevelopment(stats) {
  const averageScore = Math.min(100, Math.max(0, Number(stats.averageScore) || 0));
  const savedSkills = stats.skillScores || {};
  document.querySelectorAll('[data-skill]').forEach(item => {
    const skillName = item.dataset.skill;
    const savedScore = Number(savedSkills[skillName]);
    const score = Math.min(100, Math.max(0, Number.isFinite(savedScore) ? savedScore : averageScore));
    const bar = item.querySelector('.skill-bar-inner');
    const scoreLabel = item.querySelector('.skill-score');
    if (bar) bar.style.width = `${score}%`;
    if (scoreLabel) scoreLabel.textContent = `${Math.round(score)}/100`;
  });
}

function updateDashboardSummary(stats) {
  const completedScenarios = Number(stats.completedScenarios) || 0;
  const totalAttempts = Number(stats.totalAttempts) || 0;
  const averageScore = Number(stats.averageScore) || 0;
  const getSummary = (stat, fallbackLabel) => {
    const card = document.querySelector(`[data-stat="${stat}"]`)
      || Array.from(document.querySelectorAll('.stat-card')).find(element => {
        const label = element.querySelector('.stat-label');
        return label && label.textContent.trim() === fallbackLabel;
      });
    return card ? card.querySelector('.stat-change') : null;
  };
  const completedSummary = getSummary('completed', 'Scenarios Completed');
  const scoreSummary = getSummary('average', 'Average Score');
  const levelSummary = getSummary('level', 'Current Level');
  const attemptsSummary = getSummary('attempts', 'Total Attempts');

  if (completedSummary) {
    completedSummary.textContent = completedScenarios === 0
      ? 'No scenarios completed yet'
      : `${completedScenarios} scenario${completedScenarios === 1 ? '' : 's'} completed`;
  }
  if (scoreSummary) {
    scoreSummary.textContent = completedScenarios === 0
      ? 'Complete a scenario to get your first score'
      : `Based on ${completedScenarios} completed scenario${completedScenarios === 1 ? '' : 's'}`;
  }
  if (levelSummary) {
    levelSummary.textContent = typeof stats.levelComment === 'string' && stats.levelComment.trim()
      ? stats.levelComment
      : 'Start strong';
  }
  if (attemptsSummary) {
    attemptsSummary.textContent = totalAttempts === 0
      ? 'No attempts yet'
      : `${totalAttempts} attempt${totalAttempts === 1 ? '' : 's'} recorded`;
  }
}

function updateAchievements(stats) {
  const progress = stats.scenarioProgress || {};
  const scenarioProgress = Object.values(progress);
  const bestScore = scenarioProgress.reduce(
    (best, scenario) => Math.max(best, Number(scenario.bestScore) || 0),
    0
  );
  const masteredScenarios = Object.keys(progress).filter(type => {
    const scenario = progress[type];
    return (Number(scenario.attempts) || 0) > 0;
  }).length;
  const hasRunScenario = (Number(stats.completedScenarios) || 0) > 0;
  const attempts = Number(stats.totalAttempts) || 0;
  const averageScore = Number(stats.averageScore) || 0;
  const unlocked = {
    firstStep: hasRunScenario,
    gettingStarted: hasRunScenario && bestScore >= 80,
    risingStar: (Number(stats.completedScenarios) || 0) >= 5,
    dedication: attempts >= 10,
    consistentImprover: scenarioProgress.some(scenario => (Number(scenario.attempts) || 0) >= 3),
    master: masteredScenarios >= 6,
    perfectScore: hasRunScenario && bestScore >= 100,
    onFire: attempts >= 10 && averageScore >= 85,
    champion: hasRunScenario && averageScore >= 90,
    speedrunner: false,
    legendary: false,
    scholar: attempts >= 50
  };
  unlocked.legendary = Object.values(unlocked).every(Boolean);

  const unlockedCount = Object.values(unlocked).filter(Boolean).length;
  const achievementCount = document.getElementById('achievementCount');
  if (achievementCount) achievementCount.textContent = `${unlockedCount}/12`;
  const achievementProgress = document.querySelector('.achievement-progress .progress-bar-inner');
  const progressLabel = document.querySelector('.achievement-progress > span');
  const percentage = Math.round((unlockedCount / 12) * 100);
  if (achievementProgress) achievementProgress.style.width = `${percentage}%`;
  if (progressLabel) progressLabel.textContent = `${percentage}% Complete`;

  document.querySelectorAll('[data-achievement]').forEach(card => {
    const isUnlocked = Boolean(unlocked[card.dataset.achievement]);
    card.classList.toggle('unlocked', isUnlocked);
    card.classList.toggle('locked', !isUnlocked);
    const date = card.querySelector('.achievement-date');
    if (date) date.textContent = isUnlocked ? 'Unlocked' : 'Not unlocked';
  });
}

function generateFeedback() {
  if (!currentScenario) {
    appendMessage('Select a scenario and complete a response before requesting feedback.', 'bot');
    return;
  }
  showRecommendationStatus('Analyzing your practice to find one skill to focus on next...');
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
    const availablePages = ['dashboard', 'scenarios', 'progress', 'achievements', 'settings', 'help'];
    if (!availablePages.includes(page)) {
      console.error(`Unsupported page requested: ${page}`);
      page = 'dashboard';
    }
    fetch(`./pages/${page}.html`)
      .then(r => {
        if (!r.ok) throw new Error(`Unable to load ${page}`);
        return r.text();
      })
      .then(html => {
        document.getElementById('main-content').innerHTML = html;
        attachPageHandlers();
        applyPreferences();
        if (page === 'dashboard' && latestRecommendation) updateRecommendation(latestRecommendation);
        document.querySelectorAll('.sidebar a').forEach(link => {
          link.classList.toggle('active', link.dataset.page === page);
        });
        const savedStats = localStorage.getItem('userStats');
        if (savedStats) updateUserStats(JSON.parse(savedStats));
        else if (page === 'achievements') updateAchievements({
          completedScenarios: 0,
          totalAttempts: 0,
          averageScore: 0,
          scenarioProgress: {}
        });
      })
      .catch(err => {
        console.error(err);
        const content = document.getElementById('main-content');
        if (content) {
          content.innerHTML = '<section class="load-error" role="alert"><span class="eyebrow">Something went wrong</span><h1>We could not load this page</h1><p>Check your connection and try again.</p><button class="btn-primary" type="button" onclick="router.navigate(\'dashboard\')">Return to dashboard</button></section>';
        }
      });
  }
};

function attachPageHandlers() {
  const chatMessages = document.getElementById('chatMessages');

  document.querySelectorAll('.scenario-item[data-scenario]').forEach(button => {
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

function resetVoicePractice(statusMessage) {
  voiceTranscript = '';
  voiceInterimTranscript = '';
  voiceConfidence = 0;
  voiceStartedAt = 0;
  voiceIsRecording = false;
  if (voiceRestartTimeout) {
    window.clearTimeout(voiceRestartTimeout);
    voiceRestartTimeout = null;
  }
  setVoiceRecordingState(false);
  updateVoiceTranscript('');
  const sendButton = document.getElementById('sendVoiceBtn');
  if (sendButton) sendButton.disabled = true;
  const analysis = document.getElementById('voiceAnalysis');
  if (analysis) analysis.textContent = '';
  updateVoiceStatus(statusMessage);
}

function sendVoiceMessage() {
  const transcript = voiceTranscript.trim();
  if (!transcript || !currentScenario) return;

  const duration = voiceStartedAt ? (Date.now() - voiceStartedAt) / 1000 : 0;
  appendMessage(transcript, 'user');
  const sendButton = document.getElementById('sendVoiceBtn');
  if (sendButton) sendButton.disabled = true;
  try {
    window.socket.emit('voiceMessage', {
      transcript,
      duration,
      confidence: voiceConfidence
    });
  } catch (error) {
    console.error('Unable to send voice response:', error);
    if (sendButton) sendButton.disabled = false;
    updateVoiceStatus('Could not send your response. Please try again.');
    return;
  }
  resetVoicePractice('Response sent. Record another when ready.');
}

function selectScenario(type) {
  const hardScenarios = ['production_incident', 'difficult_colleague', 'priority_conflict'];
  if (hardScenarios.includes(type) && latestStats && !latestStats.hardScenariosUnlocked) {
    appendMessage('Hard scenarios unlock at Advanced level after you master four skills.', 'bot');
    return;
  }
  currentScenario = type;
  document.querySelectorAll('.scenario-item[data-scenario]').forEach(button => {
    const isSelected = button.dataset.scenario === type;
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  const scenarioLabel = document.getElementById('selectedScenario');
  if (scenarioLabel) {
    scenarioLabel.textContent = `Selected: ${scenarioLabels[type] || type}`;
  }
  const dashboardScenarioLabel = document.getElementById('scenarioLabel');
  if (dashboardScenarioLabel) {
    dashboardScenarioLabel.textContent = scenarioLabels[type] || type;
  }

  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.innerHTML = '<div class="chat-empty-state">Connecting to your scenario...</div>';
  }
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
  if (!chatMessages || typeof message !== 'string' || !message.trim()) return;
  const element = document.createElement('p');
  element.className = sender;
  element.textContent = message.trim();
  chatMessages.appendChild(element);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
