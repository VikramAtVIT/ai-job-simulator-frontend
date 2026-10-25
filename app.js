let currentUser = null;
let currentScenario = null;
let recommendationPending = false;
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
    const unlocked = Boolean(latestStats && latestStats.hardScenariosUnlocked);
    element.hidden = !preferences.hardScenarios && unlocked;
    element.classList.toggle('locked-scenario', !unlocked);
    element.setAttribute('aria-disabled', String(!unlocked));
    if (element.matches('.scenario-card')) {
      const startButton = element.querySelector('button');
      if (startButton) {
        startButton.disabled = !unlocked;
        startButton.textContent = unlocked ? '▶ Start scenario' : '🔒 Unlock at Advanced';
      }
    }
  });
  document.querySelectorAll('.difficulty.hard').forEach(element => {
    const card = element.closest('.scenario-card');
    if (card) {
      const unlocked = Boolean(latestStats && latestStats.hardScenariosUnlocked);
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

const scenarioCatalog = [
  { type: 'manager_review', name: 'Manager performance review', shortName: 'Manager review', icon: '👔', difficulty: 'easy', category: 'Career growth', objective: 'Share achievements with evidence, reflect on challenges, and agree on a measurable growth goal.' },
  { type: 'daily_standup', name: 'Daily standup update', shortName: 'Daily standup', icon: '☀️', difficulty: 'easy', category: 'Communication & collaboration', objective: 'Give a concise update, identify blockers, and commit to a specific next step.' },
  { type: 'time_management', name: 'Time management & delivery planning', icon: '🗓️', difficulty: 'easy', category: 'Leadership & planning', objective: 'Plan competing deliverables realistically, account for capacity, and reset expectations early.' },
  { type: 'inclusive_meeting', name: 'Inclusive meeting facilitation', icon: '🫶', difficulty: 'easy', category: 'Communication & collaboration', objective: 'Balance participation, invite accessible input, and leave the group with clear decisions.' },
  { type: 'client_requirement', name: 'Client requirement discussion', icon: '💼', difficulty: 'medium', category: 'Product & clients', objective: 'Clarify user needs and constraints, then propose a scoped solution with acceptance criteria.' },
  { type: 'code_review', name: 'Code review & maintainability', icon: '🧩', difficulty: 'medium', category: 'Software engineering', objective: 'Review correctness, edge cases, tests, and maintainability while giving actionable feedback.' },
  { type: 'data_analysis', name: 'Data analysis & experiment design', icon: '📊', difficulty: 'medium', category: 'Data & decision-making', objective: 'Choose meaningful metrics, design a fair comparison, and communicate uncertainty.' },
  { type: 'debugging', name: 'Debugging & root-cause analysis', icon: '🔎', difficulty: 'medium', category: 'Software engineering', objective: 'Investigate an intermittent defect through testable hypotheses and evidence.' },
  { type: 'product_tradeoff', name: 'Product discovery & trade-offs', icon: '🧭', difficulty: 'medium', category: 'Product & clients', objective: 'Uncover the user need behind a request and prioritize a measurable first release.' },
  { type: 'salary_negotiation', name: 'Salary negotiation', icon: '🤝', difficulty: 'medium', category: 'Career growth', objective: 'Advocate for your value with evidence while exploring compensation and total rewards.' },
  { type: 'delegation', name: 'Delegation & team leadership', icon: '🧑‍🤝‍🧑', difficulty: 'medium', category: 'Leadership & planning', objective: 'Assign clear outcomes, support autonomy, and balance workload across a team.' },
  { type: 'feedback_conversation', name: 'Giving constructive feedback', icon: '💬', difficulty: 'medium', category: 'Communication & collaboration', objective: 'Discuss observable behavior with empathy and agree on a practical improvement.' },
  { type: 'production_incident', name: 'Production incident response', icon: '🚨', difficulty: 'hard', category: 'Reliability & operations', objective: 'Triage customer impact, stabilize service safely, and coordinate incident communication.' },
  { type: 'difficult_colleague', name: 'Difficult colleague conversation', icon: '⚖️', difficulty: 'hard', category: 'Communication & collaboration', objective: 'Resolve a disagreement using empathy, evidence, and shared success measures.' },
  { type: 'priority_conflict', name: 'Priority conflict resolution', icon: '⏱️', difficulty: 'hard', category: 'Leadership & planning', objective: 'Compare impact and dependencies, explain trade-offs, and align stakeholders.' },
  { type: 'system_design', name: 'Scalable system design', icon: '🏗️', difficulty: 'hard', category: 'Software engineering', objective: 'Design for realistic workloads, reliability, failure modes, and explicit trade-offs.' },
  { type: 'security_review', name: 'Security review & threat modeling', icon: '🛡️', difficulty: 'hard', category: 'Security & privacy', objective: 'Identify trust boundaries, abuse cases, sensitive data, and proportionate mitigations.' },
  { type: 'privacy_decision', name: 'Privacy & data handling', icon: '🔐', difficulty: 'hard', category: 'Security & privacy', objective: 'Balance product needs with consent, data minimization, access controls, and retention.' },
  { type: 'customer_escalation', name: 'Customer escalation', icon: '📣', difficulty: 'hard', category: 'Product & clients', objective: 'Acknowledge customer impact, communicate known facts, and make reliable commitments.' },
  { type: 'ethical_dilemma', name: 'Ethical decision-making', icon: '🧠', difficulty: 'hard', category: 'Ethics & judgment', objective: 'Evaluate stakeholder impact and respond to a potential ethical issue responsibly.' },
  { type: 'change_management', name: 'Change management & stakeholder alignment', icon: '🔄', difficulty: 'hard', category: 'Leadership & planning', objective: 'Build alignment for a disruptive change through pilots, support, and transparent measures.' }
];
const scenarioByType = Object.fromEntries(scenarioCatalog.map(scenario => [scenario.type, scenario]));
const scenarioLabels = Object.fromEntries(scenarioCatalog.map(scenario => [scenario.type, scenario.name]));
const levelCatalog = [
  { name: 'Starter', comment: 'Start strong', threshold: 0, icon: '🌱' },
  { name: 'Explorer', comment: 'Build momentum', threshold: 2, icon: '🧭' },
  { name: 'Builder', comment: 'Sharpen skills', threshold: 4, icon: '🧱' },
  { name: 'Specialist', comment: 'Own your craft', threshold: 6, icon: '⚡' },
  { name: 'Advanced', comment: 'Ready for the toughest scenarios', threshold: 8, icon: '🔥' },
  { name: 'Pro', comment: 'Lead confidently', threshold: 10, icon: '👑' }
];
const scenarioMasteryRequirement = { attempts: 5, bestScore: 75 };
const achievementCatalog = [
  { id: 'firstStep', name: 'First Step', icon: '🏅', description: 'Complete your first evaluated practice attempt.', target: 1, unit: 'attempts', value: stats => Number(stats.completedScenarios) || 0, isUnlocked: (stats, value) => value >= 1 },
  { id: 'gettingStarted', name: 'Getting Started', icon: '🚀', description: 'Earn a best score of 80% on any scenario.', target: 80, unit: '% best score', value: stats => Math.max(0, ...Object.values(stats.scenarioProgress || {}).map(progress => Number(progress.bestScore) || 0)), isUnlocked: (stats, value) => value >= 80 },
  { id: 'risingStar', name: 'Rising Star', icon: '⭐', description: 'Complete 5 evaluated practice attempts.', target: 5, unit: 'attempts', value: stats => Number(stats.totalAttempts) || 0, isUnlocked: (stats, value) => value >= 5 },
  { id: 'dedication', name: 'Dedication', icon: '💪', description: 'Complete 10 evaluated practice attempts.', target: 10, unit: 'attempts', value: stats => Number(stats.totalAttempts) || 0, isUnlocked: (stats, value) => value >= 10 },
  { id: 'consistentImprover', name: 'Practice Makes Progress', icon: '📈', description: 'Practise the same scenario at least 3 times.', target: 3, unit: 'attempts on one scenario', value: stats => Math.max(0, ...Object.values(stats.scenarioProgress || {}).map(progress => Number(progress.attempts) || 0)), isUnlocked: (stats, value) => value >= 3 },
  { id: 'master', name: 'Scenario Master', icon: '💎', description: 'Master 6 scenario types: 5 assessed attempts and a best score of 75% on each.', target: 6, unit: 'mastered scenario types', value: stats => Object.values(stats.scenarioProgress || {}).filter(progress => (Number(progress.attempts) || 0) >= getScenarioMasteryRequirement(stats).attempts && (Number(progress.bestScore) || 0) >= getScenarioMasteryRequirement(stats).bestScore).length, isUnlocked: (stats, value) => value >= 6 },
  { id: 'perfectScore', name: 'Perfect Score', icon: '🎯', description: 'Earn a 100% score on any scenario.', target: 100, unit: '% best score', value: stats => Math.max(0, ...Object.values(stats.scenarioProgress || {}).map(progress => Number(progress.bestScore) || 0)), isUnlocked: (stats, value) => value >= 100 },
  { id: 'onFire', name: 'High Performer', icon: '🔥', description: 'Average at least 85% across 10 assessed attempts.', target: 85, unit: '% average · 10 attempts needed', value: stats => Number(stats.averageScore) || 0, isUnlocked: (stats, value) => (Number(stats.totalAttempts) || 0) >= 10 && value >= 85, progress: (stats, value) => Math.min(100, (value / 85) * 100, ((Number(stats.totalAttempts) || 0) / 10) * 100) },
  { id: 'champion', name: 'Top Performer', icon: '👑', description: 'Average at least 90% across 5 assessed attempts.', target: 90, unit: '% average · 5 attempts needed', value: stats => Number(stats.averageScore) || 0, isUnlocked: (stats, value) => (Number(stats.totalAttempts) || 0) >= 5 && value >= 90, progress: (stats, value) => Math.min(100, (value / 90) * 100, ((Number(stats.totalAttempts) || 0) / 5) * 100) },
  { id: 'versatile', name: 'Well-Rounded', icon: '🌈', description: 'Practise scenarios in 3 different skill areas.', target: 3, unit: 'skill areas', value: stats => new Set(Object.entries(stats.scenarioProgress || {}).filter(([, progress]) => (Number(progress.attempts) || 0) > 0).map(([type]) => scenarioByType[type] && scenarioByType[type].category).filter(Boolean)).size, isUnlocked: (stats, value) => value >= 3 },
  { id: 'legendary', name: 'Legendary', icon: '🌟', description: 'Unlock every other achievement.', target: 11, unit: 'other achievements', value: () => 0 },
  { id: 'scholar', name: 'Scholar', icon: '🎓', description: 'Complete 50 evaluated practice attempts.', target: 50, unit: 'attempts', value: stats => Number(stats.totalAttempts) || 0, isUnlocked: (stats, value) => value >= 50 }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getScenarioMasteryRequirement(stats) {
  const requirement = stats && stats.progression && stats.progression.masteryRequirement;
  const attempts = Number(requirement && requirement.attempts);
  const bestScore = Number(requirement && requirement.bestScore);
  return {
    attempts: Number.isInteger(attempts) && attempts > 0 ? attempts : scenarioMasteryRequirement.attempts,
    bestScore: Number.isFinite(bestScore) && bestScore > 0 ? bestScore : scenarioMasteryRequirement.bestScore
  };
}

function getScenarioMasteryProgress(progress, requirement) {
  const attempts = Math.max(0, Number(progress && progress.attempts) || 0);
  const bestScore = Math.max(0, Number(progress && progress.bestScore) || 0);
  if (attempts >= requirement.attempts && bestScore >= requirement.bestScore) return 100;
  const attemptProgress = Math.min(100, (attempts / requirement.attempts) * 100);
  const scoreProgress = Math.min(100, (bestScore / requirement.bestScore) * 100);
  return Math.min(99, Math.round((attemptProgress + scoreProgress) / 2));
}

function orderedScenarios() {
  const order = { easy: 0, medium: 1, hard: 2 };
  return [...scenarioCatalog].sort((first, second) =>
    order[first.difficulty] - order[second.difficulty] || first.name.localeCompare(second.name)
  );
}

function renderDashboardScenarios() {
  const container = document.getElementById('dashboardScenarioList');
  if (!container) return;
  container.innerHTML = orderedScenarios().map(scenario => `
    <div class="scenario-item" role="button" tabindex="0" aria-label="Start ${escapeHtml(scenario.name)}"
      data-scenario="${scenario.type}" data-difficulty="${scenario.difficulty}"${scenario.difficulty === 'hard' ? ' data-hard="true"' : ''}>
      <div class="scenario-name"><span>${scenario.icon} ${escapeHtml(scenario.shortName || scenario.name)}</span><span class="scenario-level">${scenario.difficulty}</span></div>
      <div class="scenario-category">${escapeHtml(scenario.category)}</div>
      <div class="scenario-progress"><div class="scenario-progress-bar" style="width: 0%"></div></div>
    </div>`).join('');
}

function renderScenarioCards() {
  const container = document.getElementById('scenarioCatalogGrid');
  if (!container) return;
  container.innerHTML = orderedScenarios().map(scenario => `
    <article class="scenario-card" data-scenario="${scenario.type}" data-difficulty="${scenario.difficulty}"${scenario.difficulty === 'hard' ? ' data-hard="true"' : ''}>
      <div class="scenario-card-header">
        <div class="scenario-card-icon" aria-hidden="true">${scenario.icon}</div>
        <div><h3>${escapeHtml(scenario.name)}</h3><p class="difficulty ${scenario.difficulty}">${scenario.difficulty} level</p></div>
      </div>
      <div class="scenario-card-body">
        <span class="scenario-category">${escapeHtml(scenario.category)}</span>
        <p class="scenario-objective">${escapeHtml(scenario.objective)}</p>
        <div class="scenario-details">
          <div class="detail-item"><span class="detail-label">Practice time</span><span>5–15 minutes</span></div>
          <div class="detail-item"><span class="detail-label">Difficulty</span><span>${scenario.difficulty[0].toUpperCase()}${scenario.difficulty.slice(1)}</span></div>
          <div class="detail-item"><span class="detail-label">Attempts</span><span class="progress-meta">Not attempted yet</span></div>
          <div class="detail-item"><span class="detail-label">Best score</span><span class="scenario-best-score">—</span></div>
        </div>
        <div class="progress-bar-full" role="progressbar" aria-label="${escapeHtml(scenario.name)} mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="progress-fill" style="width: 0%"></div></div>
        <p class="progress-text">Not started</p>
      </div>
      <div class="scenario-card-footer"><button class="btn-primary" type="button" onclick="startScenario('${scenario.type}')">▶ Start scenario</button></div>
    </article>`).join('');
}

function renderLevels(stats) {
  const container = document.getElementById('levelsContent');
  if (!container) return;
  const masteryRequirement = getScenarioMasteryRequirement(stats);
  const mastered = Math.max(0, Number(stats && stats.masteredSkills) || 0);
  const currentIndex = Math.max(0, levelCatalog.findIndex(level => level.name === (stats && stats.currentLevel)));
  const levels = stats && stats.progression && Array.isArray(stats.progression.levels)
    ? stats.progression.levels
    : levelCatalog.map((level, index) => ({ ...level, completed: currentIndex >= index, current: currentIndex === index }));
  const nextLevel = levelCatalog.find(level => level.threshold > mastered);
  const needed = nextLevel ? Math.max(0, nextLevel.threshold - mastered) : 0;
  const progressPercent = nextLevel
    ? Math.min(100, Math.round((mastered - levelCatalog[Math.max(0, currentIndex)].threshold) /
      Math.max(1, nextLevel.threshold - levelCatalog[Math.max(0, currentIndex)].threshold) * 100))
    : 100;
  const progression = stats && stats.progression;
  const masteredTypes = new Set(progression && Array.isArray(progression.masteredScenarios) ? progression.masteredScenarios : []);
  const scenarioProgress = stats && stats.scenarioProgress || {};

  container.innerHTML = `
    <section class="level-overview glass">
      <div class="level-current-badge">${levelCatalog[currentIndex].icon}</div>
      <div class="level-overview-copy"><span class="eyebrow">Your current level</span><h2>${escapeHtml((stats && stats.currentLevel) || 'Starter')}</h2>
        <p>${nextLevel
          ? `Master ${needed} more scenario type${needed === 1 ? '' : 's'} to reach ${nextLevel.name}.`
          : 'You have reached the highest level. Keep refining your mastery across the full scenario library.'}</p>
        <div class="level-progress-track" role="progressbar" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPercent}"><span style="width:${progressPercent}%"></span></div>
        <small>${mastered} mastered · ${nextLevel ? `${needed} needed for ${nextLevel.name}` : 'All levels complete'}</small>
      </div>
      <div class="level-rule"><strong>Mastery & retries</strong><span>Master a scenario with at least ${masteryRequirement.attempts} evaluated attempts and a best score of ${masteryRequirement.bestScore}% or higher. Retry any scenario as often as you like; there is no attempt limit.</span></div>
    </section>
    <section class="level-ladder" aria-label="All career levels">
      ${levels.map((level, index) => {
        const details = levelCatalog[index];
        const status = level.current ? 'current' : level.completed ? 'complete' : 'locked';
        const requirement = details.threshold === 0 ? 'Starting level' : `Master ${details.threshold} unique scenario types`;
        return `<article class="level-card ${status}" aria-label="${details.name}: ${level.current ? 'current level' : level.completed ? 'completed' : 'locked'}">
          <div class="level-card-icon">${details.icon}</div><div class="level-card-copy"><span class="level-step">LEVEL ${String(index + 1).padStart(2, '0')}</span><h3>${details.name}</h3><p>${details.comment}</p><strong>${requirement}</strong></div>
          <span class="level-state">${level.current ? 'Current' : level.completed ? '✓ Achieved' : '🔒 Locked'}</span>
        </article>`;
      }).join('')}
    </section>
    <section class="scenario-mastery-section glass">
      <div class="scenario-mastery-heading"><div><span class="eyebrow">Your skill map</span><h2>Scenario mastery</h2></div><span>${scenarioCatalog.length} tracks</span></div>
      <p>Every track is assessed against its own scenario-specific criteria. Hard scenarios unlock at Advanced.</p>
      <div class="scenario-mastery-grid">
        ${orderedScenarios().map(scenario => {
          const progress = scenarioProgress[scenario.type] || {};
          const attempts = Math.max(0, Number(progress.attempts) || 0);
          const bestScore = Math.max(0, Number(progress.bestScore) || 0);
          const isMastered = masteredTypes.has(scenario.type) || (attempts >= masteryRequirement.attempts && bestScore >= masteryRequirement.bestScore);
          return `<div class="mastery-row ${isMastered ? 'mastered' : ''}">
            <span class="mastery-icon">${scenario.icon}</span><div class="mastery-copy"><strong>${escapeHtml(scenario.name)}</strong><small>${escapeHtml(scenario.category)}</small></div>
            <span class="mastery-score">${attempts ? `${bestScore}% best` : 'Not tried'}</span>
            <span class="mastery-state">${isMastered ? '✓ Mastered' : `${attempts}/${masteryRequirement.attempts} attempts`}</span>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

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
    }
  });
  window.socket.on('feedbackError', message => {
    appendMessage(typeof message === 'string' ? message : 'Scenario assessment is unavailable. Please try again.', 'bot');
    showRecommendationStatus('Complete a response and try the assessment again.');
  });
  window.socket.on('skillGapRecommendation', updateRecommendation);
  window.socket.on('skillGapRecommendationError', data => {
    const message = data && typeof data.message === 'string'
      ? data.message
      : 'AI skill-gap analysis is unavailable. Please try again later.';
    showRecommendationStatus(message);
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
  window.socket.on('error', message => {
    console.error('Socket error:', message);
    if (recommendationPending) {
      const detail = typeof message === 'string' && message.trim() ? ` ${message.trim()}` : '';
      showRecommendationStatus(`Could not analyze your response.${detail}`);
    }
  });
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
  recommendationPending = false;
  const sourceNote = recommendation.source === 'scenario_fallback'
    ? ' AI coaching is temporarily unavailable; this scenario-based guidance is grounded in your response.'
    : '';
  latestRecommendation = `${skill}: ${evidence} Next practice: ${nextStep}${sourceNote}`;
  const element = document.getElementById('aiRecommendation');
  if (element) {
    element.textContent = latestRecommendation;
    element.classList.remove('recommendation-empty');
  }
}

function showRecommendationStatus(message) {
  recommendationPending = false;
  const element = document.getElementById('aiRecommendation');
  if (!element) return;
  element.textContent = message;
  element.classList.add('recommendation-empty');
}

function showRecommendationProgress(message) {
  recommendationPending = true;
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
  renderLevels(stats);
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
    progressLevel: stats.currentLevel
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
    const bestScoreLabel = item.querySelector('.scenario-best-score');
    const attempts = Number(progress && progress.attempts) || 0;
    const rawBestScore = Number(progress && progress.bestScore);
    const hasBestScore = Number.isFinite(rawBestScore) && rawBestScore >= 0;
    const hasProgress = attempts > 0 || hasBestScore;
    const mastery = getScenarioMasteryProgress(progress, getScenarioMasteryRequirement(stats));
    const bestScore = hasBestScore ? Math.min(100, Math.max(0, rawBestScore)) : mastery;
    if (bar) {
      bar.style.width = `${mastery}%`;
    }
    if (progressBar) progressBar.style.width = `${mastery}%`;
    if (fullProgressBar) fullProgressBar.style.width = `${mastery}%`;
    if (percentage) percentage.textContent = hasProgress ? `${Math.round(mastery)}%` : '—';
    if (progressText) progressText.textContent = mastery === 100
      ? 'Mastered'
      : hasProgress ? `${mastery}% mastery progress` : 'Not started';
    if (bestScoreLabel) bestScoreLabel.textContent = hasBestScore ? `${Math.round(bestScore)}%` : '—';
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
  const attempts = Number(stats.totalAttempts) || 0;
  const metrics = Object.fromEntries(achievementCatalog.map(achievement => [
    achievement.id,
    achievement.value(stats)
  ]));
  const unlocked = Object.fromEntries(achievementCatalog
    .filter(achievement => achievement.id !== 'legendary')
    .map(achievement => [
      achievement.id,
      achievement.isUnlocked(stats, metrics[achievement.id])
    ]));
  unlocked.legendary = Object.entries(unlocked)
    .filter(([id]) => id !== 'legendary')
    .every(([, isUnlocked]) => isUnlocked);
  metrics.legendary = achievementCatalog.filter(achievement =>
    achievement.id !== 'legendary' && unlocked[achievement.id]
  ).length;

  const unlockedCount = achievementCatalog.filter(achievement => unlocked[achievement.id]).length;
  const totalAchievements = achievementCatalog.length;
  const achievementCount = document.getElementById('achievementCount');
  if (achievementCount) achievementCount.textContent = `${unlockedCount}/${totalAchievements}`;
  const achievementProgress = document.querySelector('.achievement-progress .progress-bar-inner');
  const achievementProgressBar = document.querySelector('.achievement-progress .progress-bar-outer');
  const progressLabel = document.querySelector('.achievement-progress > span');
  const percentage = Math.round((unlockedCount / totalAchievements) * 100);
  if (achievementProgress) achievementProgress.style.width = `${percentage}%`;
  if (achievementProgressBar) achievementProgressBar.setAttribute('aria-valuenow', String(percentage));
  if (progressLabel) progressLabel.textContent = `${percentage}% Complete`;
  const achievementGrid = document.querySelector('.achievements-grid');
  if (achievementGrid) {
    achievementGrid.innerHTML = achievementCatalog.map(achievement => {
      const value = metrics[achievement.id];
      const isUnlocked = unlocked[achievement.id];
      const rawProgress = Math.min(100, Math.round((value / achievement.target) * 100));
      const progress = achievement.id === 'legendary'
        ? Math.round((metrics.legendary / achievement.target) * 100)
        : achievement.progress ? Math.round(achievement.progress(stats, value)) : rawProgress;
      const displayValue = achievement.unit.startsWith('%')
        ? `${Math.min(value, achievement.target)}% / ${achievement.target}%`
        : `${Math.min(value, achievement.target)} / ${achievement.target} ${achievement.unit}`;
      const extraRequirement = achievement.id === 'onFire'
        ? ` · ${Math.min(attempts, 10)}/10 attempts`
        : achievement.id === 'champion'
          ? ` · ${Math.min(attempts, 5)}/5 attempts`
          : '';
      const progressDescription = achievement.id === 'legendary'
        ? `${metrics.legendary}/11 other achievements`
        : `${displayValue}${extraRequirement}`;
      return `<article class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}" data-achievement="${achievement.id}" aria-label="${escapeHtml(achievement.name)}: ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="achievement-card-top"><span class="achievement-badge" aria-hidden="true">${achievement.icon}</span><span class="achievement-status">${isUnlocked ? '✓ Earned' : 'In progress'}</span></div>
        <div class="achievement-info"><h3>${escapeHtml(achievement.name)}</h3><p>${escapeHtml(achievement.description)}</p></div>
        <div class="achievement-progress-small"><div class="achievement-progress-track" role="progressbar" aria-label="${escapeHtml(achievement.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${isUnlocked ? 100 : Math.min(progress, 99)}"><span style="width:${isUnlocked ? 100 : Math.min(progress, 99)}%"></span></div>
          <span>${escapeHtml(progressDescription)}</span></div>
      </article>`;
    }).join('');
  }

}

function generateFeedback() {
  if (!currentScenario) {
    appendMessage('Select a scenario and complete a response before requesting feedback.', 'bot');
    return;
  }
  showRecommendationProgress('Analyzing your practice to find one skill to focus on next...');
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
    const source = feedback.assessmentSource ? ` Assessment: ${feedback.assessmentSource}.` : '';
    feedbackText.textContent = `${feedback.summary || (feedback.score >= 80
      ? 'Strong performance. Keep using specific evidence and clear next steps.'
      : 'Good practice session. Focus on specific examples, trade-offs, and measurable outcomes.')}${source}`;
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
  window.location.href = './index.html';
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
    const availablePages = ['dashboard', 'scenarios', 'levels', 'progress', 'achievements', 'settings', 'help'];
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
        if (page === 'dashboard') renderDashboardScenarios();
        if (page === 'scenarios') renderScenarioCards();
        if (page === 'levels') renderLevels(latestStats);
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
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectScenario(button.dataset.scenario);
      }
    });
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
  showRecommendationProgress('Analyzing your latest response for a skill to focus on next...');
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
  const scenario = typeof type === 'string' && Object.prototype.hasOwnProperty.call(scenarioByType, type)
    ? scenarioByType[type]
    : null;
  if (!scenario) {
    appendMessage('Please select a valid practice scenario.', 'bot');
    return;
  }
  if (scenario.difficulty === 'hard' && (!latestStats || !latestStats.hardScenariosUnlocked)) {
    appendMessage(latestStats
      ? 'Hard scenarios unlock at Advanced level after you master four scenario types.'
      : 'Your progress is still loading. Please try again in a moment.', 'bot');
    return;
  }
  currentScenario = type;
  latestRecommendation = null;
  showRecommendationStatus('Send a text or voice response to get a personalized skill-gap focus.');
  document.querySelectorAll('.scenario-item[data-scenario]').forEach(button => {
    const isSelected = button.dataset.scenario === type;
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });

  const scenarioLabel = document.getElementById('selectedScenario');
  if (scenarioLabel) {
    scenarioLabel.textContent = `Selected: ${scenarioLabels[type]}`;
  }
  const dashboardScenarioLabel = document.getElementById('scenarioLabel');
  if (dashboardScenarioLabel) {
    dashboardScenarioLabel.textContent = scenarioLabels[type];
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
  showRecommendationProgress('Analyzing your latest response for a skill to focus on next...');
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
