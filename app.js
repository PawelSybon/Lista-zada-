/* ==========================================
   iOS Task & Limit Manager - Main Engine JS
   Universal Compatibility: Windows, iOS, macOS
   With View Layout Switcher (Mobile vs Desktop)
   ========================================== */

// --- Clean Default State: No initial demo tasks or limits ---
const DEFAULT_TASKS = [];
const DEFAULT_LIMITS = [];

const DEFAULT_SETTINGS = {
  theme: 'light',
  layoutView: 'mobile',
  soundEnabled: true,
  pointGoal: 1000
};

// --- Web Audio Synthesizer ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.alarmInterval = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playCompleteSound(pts) {
    if (!appState.settings.soundEnabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    if (pts >= 1000) {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.3);
    } else if (pts >= 500) {
      osc.frequency.setValueAtTime(493.88, now);
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.25);
    } else if (pts >= 100) {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
    } else if (pts >= 10) {
      osc.frequency.setValueAtTime(349.23, now);
      osc.frequency.exponentialRampToValueAtTime(698.46, now + 0.15);
    } else {
      osc.frequency.setValueAtTime(329.63, now);
      osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.1);
    }

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  playClickSound() {
    if (!appState.settings.soundEnabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  startContinuousAlarm() {
    if (!appState.settings.soundEnabled) return;
    this.stopContinuousAlarm();
    this.init();

    this.alarmInterval = setInterval(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.2);

      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    }, 400);
  }

  stopContinuousAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }
}

const sounds = new SoundEngine();

// --- App State ---
let appState = {
  tasks: [],
  limits: [],
  settings: { ...DEFAULT_SETTINGS },
  stats: {
    totalPoints: 1000,
    completedTasksCount: 0,
    uncompletedTasksCount: 0,
    completedByFreq: { daily: 0, weekly: 0, monthly: 0, halfYearly: 0, yearly: 0 },
    limitsTrackedCount: 0,
    limitsExceededCount: 0
  },
  currentTab: 'dashboard',
  currentFreqFilter: 'daily',
  activeTimers: {}
};

let modalActiveTab = 'task'; // 'task' or 'limit'

// --- Point Values & Badges ---
const POINT_VALUES = {
  daily: 1,
  weekly: 10,
  monthly: 100,
  halfYearly: 500,
  yearly: 1000
};

const NEON_PTS_CLASSES = {
  daily: 'pts-1',
  weekly: 'pts-10',
  monthly: 'pts-100',
  halfYearly: 'pts-500',
  yearly: 'pts-1000'
};

const BADGES = [
  { 
    id: 'b_warning_low', 
    name: '🚨 Alarm Kryzysowy!', 
    icon: '⚠️', 
    desc: 'Uwaga! Spadłeś na poziom 10 pkt!', 
    check: (s) => s.totalPoints <= 10 
  },
  { 
    id: 'b_legend_2000', 
    name: '🚀 Złota Elita 2000', 
    icon: '👑', 
    desc: 'Uwaga! Zdobyłeś 2000 punktów!', 
    check: (s) => s.totalPoints >= 2000 
  },
  { 
    id: 'b_all_categories', 
    name: '🌟 Wielobojowy Mistrz', 
    icon: '🎖️', 
    desc: 'Wykonano zadania z wszystkich 5 kategorii!', 
    check: (s) => (
      (s.completedByFreq.daily || 0) >= 1 &&
      (s.completedByFreq.weekly || 0) >= 1 &&
      (s.completedByFreq.monthly || 0) >= 1 &&
      (s.completedByFreq.halfYearly || 0) >= 1 &&
      (s.completedByFreq.yearly || 0) >= 1
    )
  },
  { 
    id: 'b_streak_5', 
    name: '🔥 Ognista Passa (5d)', 
    icon: '⚡', 
    desc: 'Zdobądź 5-dniową serię (5 passe)!', 
    check: (s, state) => state.tasks.some(t => (t.streak || 0) >= 5) 
  },
  { 
    id: 'b_streak_10', 
    name: '🛡️ Niepowstrzymana Passa', 
    icon: '⚔️', 
    desc: 'Zdobądź 10 serii z rzędu (10 passe)!', 
    check: (s, state) => state.tasks.some(t => (t.streak || 0) >= 10) 
  },
  { 
    id: 'b_streak_100', 
    name: '🏆 Wielki Finał: Setka!', 
    icon: '🌌', 
    desc: 'Wielki Finał! Zdobyłeś 100 Passe!!!', 
    check: (s, state) => state.tasks.some(t => (t.streak || 0) >= 100) 
  }
];

// --- Automatic Period Reset & Monthly Statistics Wipe ---
function getPeriodKeys() {
  const now = new Date();
  const dailyKey = now.toISOString().split('T')[0];
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const weeklyKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  
  const monthlyKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const halfYearlyKey = `${now.getFullYear()}-H${now.getMonth() < 6 ? '1' : '2'}`;
  const yearlyKey = `${now.getFullYear()}`;

  return { dailyKey, weeklyKey, monthlyKey, halfYearlyKey, yearlyKey };
}

function checkAndResetPeriods() {
  const keys = getPeriodKeys();
  const savedKeys = JSON.parse(localStorage.getItem('ios_app_reset_keys') || '{}');
  let resetCategories = [];
  let totalDeducted = 0;

  // Daily Reset
  if (savedKeys.dailyKey !== keys.dailyKey) {
    let penalty = 0;
    appState.tasks.forEach(t => {
      if (t.frequency === 'daily') {
        if (!t.completed) {
          t.streak = 0;
          penalty += 1;
          appState.stats.uncompletedTasksCount = (appState.stats.uncompletedTasksCount || 0) + 1;
        }
        t.completed = false;
        t.lastCompletedKey = null;
      }
    });
    if (penalty > 0) {
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - penalty);
      totalDeducted += penalty;
    }

    appState.limits.forEach(l => {
      l.usedSeconds = 0;
      l.exceeded = false;
      l.alarmActive = false;
      l.lastFinishedDailyKey = null;
    });

    resetCategories.push(`Codzienne (-${penalty} pkt)`);
  }

  // Weekly Reset
  if (savedKeys.weeklyKey !== keys.weeklyKey) {
    let penalty = 0;
    appState.tasks.forEach(t => {
      if (t.frequency === 'weekly') {
        if (!t.completed) {
          t.streak = 0;
          penalty += 10;
          appState.stats.uncompletedTasksCount = (appState.stats.uncompletedTasksCount || 0) + 1;
        }
        t.completed = false;
        t.lastCompletedKey = null;
      }
    });
    if (penalty > 0) {
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - penalty);
      totalDeducted += penalty;
    }
    resetCategories.push(`Tygodniowe (-${penalty} pkt)`);
  }

  // Monthly Reset (Resets Task/Limit Status AND Resets all Monthly Statistics counters to 0!)
  if (savedKeys.monthlyKey !== keys.monthlyKey) {
    let penalty = 0;
    appState.tasks.forEach(t => {
      if (t.frequency === 'monthly') {
        if (!t.completed) {
          t.streak = 0;
          penalty += 100;
        }
        t.completed = false;
        t.lastCompletedKey = null;
      }
    });
    if (penalty > 0) {
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - penalty);
      totalDeducted += penalty;
    }

    // AUTOMATIC MONTHLY STATISTICS RESET TO 0 AT THE END OF THE MONTH:
    appState.stats.completedTasksCount = 0;
    appState.stats.uncompletedTasksCount = 0;
    appState.stats.limitsExceededCount = 0;
    appState.stats.limitsTrackedCount = 0;
    appState.stats.completedByFreq = { daily: 0, weekly: 0, monthly: 0, halfYearly: 0, yearly: 0 };

    resetCategories.push(`Koniec Miesiąca: Statystyki wyzerowane`);
  }

  // Half-Yearly Reset
  if (savedKeys.halfYearlyKey !== keys.halfYearlyKey) {
    let penalty = 0;
    appState.tasks.forEach(t => {
      if (t.frequency === 'halfYearly') {
        if (!t.completed) {
          t.streak = 0;
          penalty += 500;
          appState.stats.uncompletedTasksCount = (appState.stats.uncompletedTasksCount || 0) + 1;
        }
        t.completed = false;
        t.lastCompletedKey = null;
      }
    });
    if (penalty > 0) {
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - penalty);
      totalDeducted += penalty;
    }
    resetCategories.push(`Półroczne (-${penalty} pkt)`);
  }

  // Yearly Reset
  if (savedKeys.yearlyKey !== keys.yearlyKey) {
    let penalty = 0;
    appState.tasks.forEach(t => {
      if (t.frequency === 'yearly') {
        if (!t.completed) {
          t.streak = 0;
          penalty += 1000;
          appState.stats.uncompletedTasksCount = (appState.stats.uncompletedTasksCount || 0) + 1;
        }
        t.completed = false;
        t.lastCompletedKey = null;
      }
    });
    if (penalty > 0) {
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - penalty);
      totalDeducted += penalty;
    }
    resetCategories.push(`Roczne (-${penalty} pkt)`);
  }

  localStorage.setItem('ios_app_reset_keys', JSON.stringify(keys));
  saveData();

  if (resetCategories.length > 0) {
    const msg = totalDeducted > 0
      ? `📅 Nowy miesiąc/cykl! Zresetowano statystyki.`
      : `🎉 Nowy miesiąc rozpoczęty!`;

    updateDynamicIsland(msg, true);
    setTimeout(() => updateDynamicIsland('Dzisiejszy Focus', false), 5000);
  }
}

// --- Persistence ---
function loadData() {
  const savedTasks = localStorage.getItem('ios_app_tasks');
  const savedLimits = localStorage.getItem('ios_app_limits');
  const savedSettings = localStorage.getItem('ios_app_settings');
  const savedStats = localStorage.getItem('ios_app_stats');

  appState.tasks = savedTasks ? JSON.parse(savedTasks) : DEFAULT_TASKS;
  appState.limits = savedLimits ? JSON.parse(savedLimits) : DEFAULT_LIMITS;
  
  appState.limits.forEach(l => {
    if (l.targetSeconds === undefined) {
      l.targetSeconds = (l.targetMinutes || 60) * 60;
      l.usedSeconds = (l.usedMinutes || 0) * 60;
      l.unit = 'minutes';
    }
    if (l.exceeded === undefined) l.exceeded = false;
    if (l.alarmActive === undefined) l.alarmActive = false;
    if (l.lastFinishedDailyKey === undefined) l.lastFinishedDailyKey = null;
  });

  appState.settings = savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
  if (!appState.settings.theme) appState.settings.theme = 'light';
  if (!appState.settings.layoutView) appState.settings.layoutView = 'mobile';

  appState.stats = savedStats ? JSON.parse(savedStats) : {
    totalPoints: 1000,
    completedTasksCount: 0,
    uncompletedTasksCount: 0,
    completedByFreq: { daily: 0, weekly: 0, monthly: 0, halfYearly: 0, yearly: 0 },
    limitsTrackedCount: 0,
    limitsExceededCount: 0
  };

  checkAndResetPeriods();
}

function saveData() {
  localStorage.setItem('ios_app_tasks', JSON.stringify(appState.tasks));
  localStorage.setItem('ios_app_limits', JSON.stringify(appState.limits));
  localStorage.setItem('ios_app_settings', JSON.stringify(appState.settings));
  localStorage.setItem('ios_app_stats', JSON.stringify(appState.stats));
}

// --- Dynamic Island Banner Update ---
function updateDynamicIsland(text, active = false) {
  const island = document.getElementById('dynamic-island');
  const textEl = document.getElementById('dynamic-island-text');
  if (island && textEl) {
    textEl.textContent = text || 'Dzisiejszy Focus';
    if (active) {
      island.classList.add('active');
    } else {
      island.classList.remove('active');
    }
  }
}

// --- Time Formatting Helper ---
function formatTimeString(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  if (m > 0) {
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  return `${s}s`;
}

function formatLimitTimeDisplay(usedSec, targetSec, unit) {
  if (unit === 'seconds') {
    return `${usedSec}s / ${targetSec}s`;
  }
  if (unit === 'minutes') {
    const usedM = Math.floor(usedSec / 60);
    const usedS = usedSec % 60;
    const targetM = Math.floor(targetSec / 60);
    return `${usedM}m ${String(usedS).padStart(2, '0')}s / ${targetM}m`;
  }
  
  const usedH = Math.floor(usedSec / 3600);
  const usedM = Math.floor((usedSec % 3600) / 60);
  const targetH = (targetSec / 3600).toFixed(1).replace('.0', '');
  if (usedM === 0) {
    return `${usedH}h <span>/ ${targetH}h Wykorzystano</span>`;
  }
  return `${usedH}h ${String(usedM).padStart(2, '0')}m <span>/ ${targetH}h</span>`;
}

// --- Clean SVG Circular Gauge Renderer ---
function renderCircularGaugeSvg(pct) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  let strokeGradient = 'url(#ringGradientCyan)';

  if (pct >= 100) {
    strokeGradient = 'url(#ringGradientRed)';
  } else if (pct >= 80) {
    strokeGradient = 'url(#ringGradientOrange)';
  }

  return `
    <div class="ring-gauge-container">
      <svg width="105" height="105" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="ringGradientCyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#34C759" />
            <stop offset="100%" stop-color="#007AFF" />
          </linearGradient>
          <linearGradient id="ringGradientRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FF3B30" />
            <stop offset="100%" stop-color="#FF9500" />
          </linearGradient>
          <linearGradient id="ringGradientOrange" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FF9500" />
            <stop offset="100%" stop-color="#FFCC00" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="${radius}" stroke="var(--ios-glass-border)" stroke-width="9" fill="transparent" />
        <circle cx="50" cy="50" r="${radius}" stroke="${strokeGradient}" stroke-width="9" fill="transparent"
          stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}"
          stroke-linecap="round" transform="rotate(-90 50 50)" style="transition: stroke-dashoffset 0.5s ease;" />
      </svg>
      <div class="ring-gauge-text">${pct}%</div>
    </div>
  `;
}

// --- Limit Modal Validation Handlers ---
function updateLimitInputMax() {
  const unitSelect = document.getElementById('select-limit-unit');
  const valInput = document.getElementById('input-limit-target-val');
  if (!unitSelect || !valInput) return;

  const unit = unitSelect.value;
  if (unit === 'hours') {
    valInput.max = 23;
    valInput.placeholder = 'np. 2';
  } else if (unit === 'minutes') {
    valInput.max = 59;
    valInput.placeholder = 'np. 30';
  } else if (unit === 'seconds') {
    valInput.max = 59;
    valInput.placeholder = 'np. 45';
  }
  clampLimitInputValue();
}

function clampLimitInputValue() {
  const unitSelect = document.getElementById('select-limit-unit');
  const valInput = document.getElementById('input-limit-target-val');
  if (!unitSelect || !valInput || !valInput.value) return;

  const unit = unitSelect.value;
  const num = parseFloat(valInput.value);

  if (unit === 'hours' && num > 23) valInput.value = 23;
  if (unit === 'minutes' && num > 59) valInput.value = 59;
  if (unit === 'seconds' && num > 59) valInput.value = 59;
  if (num < 1) valInput.value = 1;
}

// --- UI Renderers, Layout Switcher & Theme Controller ---

function applyLayoutView() {
  const frame = document.getElementById('app-frame');
  if (!frame) return;

  const viewMode = appState.settings.layoutView || 'mobile';
  if (viewMode === 'desktop') {
    frame.classList.add('desktop-mode');
  } else {
    frame.classList.remove('desktop-mode');
  }
}

function applyTheme() {
  const mode = appState.settings.theme || 'light';
  let activeTheme = mode;

  if (mode === 'auto') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = prefersDark ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', activeTheme);
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (appState.settings.theme === 'auto') {
      applyTheme();
    }
  });
}

function renderHeader() {
  const pointsVal = document.getElementById('header-points-val');
  if (pointsVal) {
    pointsVal.textContent = appState.stats.totalPoints;
  }
}

// --- Render Dashboard View ---
function renderDashboard() {
  const dateSub = document.getElementById('dashboard-date-subtitle');
  if (dateSub) {
    const now = new Date();
    const options = { day: 'numeric', month: 'long' };
    dateSub.textContent = now.toLocaleDateString('pl-PL', options);
  }

  // 1. Render Screen Time Limits
  const limitsGrid = document.getElementById('dashboard-limits-scroll');
  if (limitsGrid) {
    if (appState.limits.length === 0) {
      limitsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; font-size:0.85rem; color:var(--ios-text-secondary); opacity:0.8; padding:10px;">
          Brak limitów. Dodaj nowy limit przyciskiem '+'.
        </div>
      `;
    } else {
      limitsGrid.innerHTML = appState.limits.map(l => {
        const usedSec = l.usedSeconds || 0;
        const targetSec = l.targetSeconds || 3600;
        const pct = Math.min(Math.round((usedSec / targetSec) * 100), 100);

        return `
          <div class="limit-dashboard-card" onclick="switchTab('limits')">
            <div class="limit-dashboard-header">
              <span>${l.title}</span>
              <span>${l.icon || '⌛'}</span>
            </div>
            <div class="limit-dashboard-subtitle">${formatLimitTimeDisplay(usedSec, targetSec, l.unit)}</div>
            ${renderCircularGaugeSvg(pct)}
          </div>
        `;
      }).join('');
    }
  }

  // 2. Render Tasks 2x2 Grid
  const tasksGrid = document.getElementById('dashboard-tasks-grid');
  if (tasksGrid) {
    if (appState.tasks.length === 0) {
      tasksGrid.innerHTML = `
        <div style="grid-column: 1 / -1; font-size:0.85rem; color:var(--ios-text-secondary); opacity:0.8; padding:10px;">
          Brak zadań. Dodaj zadanie przyciskiem '+'.
        </div>
      `;
    } else {
      tasksGrid.innerHTML = appState.tasks.map(t => {
        const pts = POINT_VALUES[t.frequency] || 1;
        const neonClass = NEON_PTS_CLASSES[t.frequency] || 'pts-1';

        return `
          <div class="task-dashboard-card ${t.completed ? 'completed' : ''}" onclick="toggleTask('${t.id}', event)">
            <div class="task-dashboard-card-header">
              <div class="check-icon-badge ${t.completed ? '' : 'uncompleted'}">
                ${t.completed ? '✓' : ''}
              </div>
              <div class="neon-pts-badge ${neonClass}">+${pts} PKT</div>
            </div>
            <div class="task-dashboard-card-title">${escapeHtml(t.title)}</div>
          </div>
        `;
      }).join('');
    }
  }
}

// Render Tasks List
function renderTasks() {
  const container = document.getElementById('tasks-list-container');
  if (!container) return;

  const filteredTasks = appState.tasks.filter(t => t.frequency === appState.currentFreqFilter);

  if (filteredTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:40px 10px;">
        <div class="empty-state-icon" style="font-size:2.5rem; margin-bottom:8px;">📋</div>
        <div class="empty-state-text" style="font-weight:800; color:var(--ios-text-primary);">Brak zadań w tej kategorii</div>
        <div style="font-size:0.78rem; margin-top:4px; color:var(--ios-text-secondary);">Kliknij przycisk '+', aby dodać swoje pierwsze zadanie</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredTasks.map(t => `
    <div class="ios-card task-item ${t.completed ? 'completed' : ''}" data-id="${t.id}" onclick="toggleTask('${t.id}', event)">
      <div class="task-checkbox ${t.completed ? 'checked' : ''}">
        ${t.completed ? '✓' : ''}
      </div>
      <div class="task-info">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span>Seria: 🔥 ${t.streak || 0}d</span>
          ${t.completed ? '<span style="color:var(--ios-success); font-weight:800; margin-left:8px;">✅ Ukończone</span>' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// Render Limits List
function renderLimits() {
  const container = document.getElementById('limits-list-container');
  if (!container) return;

  if (appState.limits.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:40px 10px;">
        <div class="empty-state-icon" style="font-size:2.5rem; margin-bottom:8px;">⏱️</div>
        <div class="empty-state-text" style="font-weight:800; color:var(--ios-text-primary);">Brak dodanych limitów</div>
        <div style="font-size:0.78rem; margin-top:4px; color:var(--ios-text-secondary);">Kliknij przycisk '+', aby dodać nowy limit</div>
      </div>
    `;
    return;
  }

  const currentDailyKey = getPeriodKeys().dailyKey;

  container.innerHTML = appState.limits.map(l => {
    const usedSec = l.usedSeconds || 0;
    const targetSec = l.targetSeconds || 3600;
    const pct = Math.min(Math.round((usedSec / targetSec) * 100), 100);
    
    const isExceeded = !!l.exceeded;
    const isAlarmActive = !!l.alarmActive;
    const isFinishedToday = l.lastFinishedDailyKey === currentDailyKey;
    const isWarning = usedSec >= targetSec * 0.8 && !isExceeded && !isAlarmActive && !isFinishedToday;
    
    let statusClass = 'safe';
    let statusText = formatLimitTimeDisplay(usedSec, targetSec, l.unit);
    
    if (isExceeded) {
      statusClass = 'exceeded';
      statusText = `🚨 PRZEKROCZONO (-250 pkt)`;
    } else if (isFinishedToday) {
      statusClass = 'safe';
      statusText = `✅ Wykorzystano na dziś`;
    } else if (isAlarmActive) {
      statusClass = 'warning';
      statusText = `⏰ Wyłącz alarm! (w 30s)`;
    } else if (isWarning) {
      statusClass = 'warning';
      statusText = `Uwaga (${statusText})`;
    }

    let fillColor = 'var(--ios-success)';
    if (isExceeded) fillColor = 'var(--ios-danger)';
    else if (isAlarmActive || isWarning) fillColor = 'var(--ios-warning)';

    const isRunning = !!appState.activeTimers[l.id];

    let actionBtnHtml = '';
    if (isFinishedToday || isExceeded) {
      actionBtnHtml = `
        <button class="timer-btn" disabled style="width:100%; justify-content:center; opacity:0.65; cursor:not-allowed; background:var(--ios-bg-tertiary); color:var(--ios-text-secondary); box-shadow:none;">
          🔒 Limit zakończony na dziś
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="timer-btn ${isRunning ? 'running' : ''}" style="width:100%; justify-content:center;" onclick="toggleLimitTimer('${l.id}')">
          ${isRunning ? '⏸️ Pauza Stopera' : '▶️ Uruchom Stoper'}
        </button>
      `;
    }

    return `
      <div class="ios-card limit-card ${isExceeded ? 'card-exceeded-alert' : ''}">
        <div class="limit-header">
          <div class="limit-title">${l.icon || '⌛'} ${escapeHtml(l.title)}</div>
          <div class="limit-status-pill ${statusClass}">${statusText}</div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; margin:8px 0;">
          <div style="flex:1;">
            <div class="limit-progress-bar">
              <div class="limit-progress-fill" style="width: ${pct}%; background-color: ${fillColor};"></div>
            </div>
          </div>
          <div style="font-weight:900; font-size:1.1rem; margin-left:14px; min-width:48px; text-align:right; color:var(--ios-text-primary);">${pct}%</div>
        </div>

        <div class="limit-actions">
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderStats() {
  const currentUncompleted = appState.tasks.filter(t => !t.completed).length;
  const totalUncompleted = (appState.stats.uncompletedTasksCount || 0) + currentUncompleted;

  document.getElementById('stat-tasks-total').textContent = appState.stats.completedTasksCount;
  document.getElementById('stat-tasks-uncompleted').textContent = totalUncompleted;
  document.getElementById('stat-limits-exceeded').textContent = appState.stats.limitsExceededCount;
  document.getElementById('stat-points-total').textContent = appState.stats.totalPoints;

  const breakdownContainer = document.getElementById('stats-breakdown-list');
  if (breakdownContainer) {
    const f = appState.stats.completedByFreq;
    breakdownContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--ios-glass-border); color:var(--ios-text-primary);">
        <span>☀️ Codzienne (+1 / -1 pkt)</span>
        <strong>${f.daily || 0} zrobione</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--ios-glass-border); color:var(--ios-text-primary);">
        <span>📅 Tygodniowe (+10 / -10 pkt)</span>
        <strong>${f.weekly || 0} zrobione</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--ios-glass-border); color:var(--ios-text-primary);">
        <span>🗓️ Miesięczne (+100 / -100 pkt)</span>
        <strong>${f.monthly || 0} zrobione</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--ios-glass-border); color:var(--ios-text-primary);">
        <span>🌗 Półroczne (+500 / -500 pkt)</span>
        <strong>${f.halfYearly || 0} zrobione</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:8px 0; color:var(--ios-text-primary);">
        <span>🎯 Roczne (+1000 / -1000 pkt)</span>
        <strong>${f.yearly || 0} zrobione</strong>
      </div>
    `;
  }

  const badgesGrid = document.getElementById('badges-grid');
  if (badgesGrid) {
    badgesGrid.innerHTML = BADGES.map(b => {
      const unlocked = b.check(appState.stats, appState);
      return `
        <div class="badge-item ${unlocked ? 'unlocked' : ''}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${b.name}</div>
          <div style="font-size:0.65rem; opacity:0.85; margin-top:2px; color:var(--ios-text-secondary);">${b.desc}</div>
        </div>
      `;
    }).join('');
  }
}

function renderSettings() {
  const layoutSelect = document.getElementById('setting-layout-select');
  if (layoutSelect) layoutSelect.value = appState.settings.layoutView || 'mobile';

  const themeSelect = document.getElementById('setting-theme-select');
  if (themeSelect) themeSelect.value = appState.settings.theme || 'light';
  
  const soundToggle = document.getElementById('setting-sound-toggle');
  if (soundToggle) soundToggle.checked = appState.settings.soundEnabled;

  renderSettingsManageList();
}

function renderSettingsManageList() {
  const container = document.getElementById('settings-manage-items-list');
  if (!container) return;

  if (appState.tasks.length === 0 && appState.limits.length === 0) {
    container.innerHTML = `
      <div class="settings-row" style="color:var(--ios-text-secondary); font-size:0.85rem;">
        Brak dodanych zadań i limitów do usunięcia
      </div>
    `;
    return;
  }

  let html = '';

  if (appState.tasks.length > 0) {
    html += `<div style="padding:10px 16px 4px 16px; font-weight:800; font-size:0.75rem; color:var(--ios-text-secondary); text-transform:uppercase;">Zadania</div>`;
    appState.tasks.forEach(t => {
      html += `
        <div class="settings-row">
          <div class="settings-left">
            <span style="font-size:0.88rem; font-weight:700; color:var(--ios-text-primary);">📋 ${escapeHtml(t.title)}</span>
            <span style="font-size:0.72rem; color:var(--ios-text-secondary);">(${getFrequencyLabel(t.frequency)})</span>
          </div>
          <button class="delete-btn" onclick="deleteTaskFromSettings('${t.id}')">Usuń ✕</button>
        </div>
      `;
    });
  }

  if (appState.limits.length > 0) {
    html += `<div style="padding:10px 16px 4px 16px; font-weight:800; font-size:0.75rem; color:var(--ios-text-secondary); text-transform:uppercase;">Limity</div>`;
    appState.limits.forEach(l => {
      const statusBadge = l.exceeded ? ' <span style="color:var(--ios-danger); font-size:0.72rem;">(Przekroczony: -250 pkt)</span>' : '';
      html += `
        <div class="settings-row">
          <div class="settings-left">
            <span style="font-size:0.88rem; font-weight:700; color:var(--ios-text-primary);">${l.icon || '⌛'} ${escapeHtml(l.title)}${statusBadge}</span>
          </div>
          <button class="delete-btn" onclick="deleteLimitFromSettings('${l.id}')">Usuń ✕</button>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// --- Deletion Logic with Complete Task & Limit Stats Rollback ---
function deleteTaskFromSettings(id) {
  sounds.playClickSound();

  const taskToDelete = appState.tasks.find(t => t.id === id);
  if (taskToDelete) {
    if (taskToDelete.completed) {
      const pts = POINT_VALUES[taskToDelete.frequency] || 0;
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - pts);
      appState.stats.completedTasksCount = Math.max(0, appState.stats.completedTasksCount - 1);
      if (appState.stats.completedByFreq[taskToDelete.frequency] > 0) {
        appState.stats.completedByFreq[taskToDelete.frequency] -= 1;
      }
    }
  }

  appState.tasks = appState.tasks.filter(t => t.id !== id);
  saveData();
  
  renderHeader();
  renderSettings();
  renderDashboard();
  renderTasks();
  renderStats();
}

function deleteLimitFromSettings(limitId) {
  sounds.playClickSound();

  const limitToDelete = appState.limits.find(l => l.id === limitId);
  if (limitToDelete) {
    if (appState.activeTimers[limitId]) {
      clearInterval(appState.activeTimers[limitId]);
      delete appState.activeTimers[limitId];
    }

    if ((limitToDelete.usedSeconds || 0) > 0) {
      appState.stats.limitsTrackedCount = Math.max(0, appState.stats.limitsTrackedCount - 1);
    }

    if (limitToDelete.exceeded) {
      appState.stats.limitsExceededCount = Math.max(0, appState.stats.limitsExceededCount - 1);
      appState.stats.totalPoints += 250;
    }
  }

  appState.limits = appState.limits.filter(l => l.id !== limitId);
  saveData();

  renderHeader();
  renderSettings();
  renderDashboard();
  renderLimits();
  renderStats();
}

// --- Helper Functions ---
function getFrequencyLabel(freq) {
  switch (freq) {
    case 'daily': return 'Codzienne (1 pkt)';
    case 'weekly': return 'Tygodniowe (10 pkt)';
    case 'monthly': return 'Miesięczne (100 pkt)';
    case 'halfYearly': return 'Półroczne (500 pkt)';
    case 'yearly': return 'Roczne (1000 pkt)';
    default: return freq;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Navigation & Action Handlers ---

function switchTab(tabId) {
  sounds.playClickSound();
  appState.currentTab = tabId;

  const tabTitles = {
    dashboard: 'Dzisiejszy Focus',
    tasks: 'Zadania',
    limits: 'Limity',
    stats: 'Statystyki',
    settings: 'Ustawienia'
  };

  const titleEl = document.getElementById('header-tab-title');
  if (titleEl) {
    titleEl.textContent = tabTitles[tabId] || 'Dzisiejszy Focus';
  }

  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  const targetBtn = document.getElementById(`nav-${tabId}`);

  if (targetPane) targetPane.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');

  const fab = document.getElementById('fab-add-btn');
  if (fab) {
    fab.style.display = (tabId === 'dashboard' || tabId === 'tasks' || tabId === 'limits') ? 'flex' : 'none';
  }

  if (tabId === 'dashboard') renderDashboard();
  if (tabId === 'tasks') renderTasks();
  if (tabId === 'limits') renderLimits();
  if (tabId === 'stats') renderStats();
  if (tabId === 'settings') renderSettings();
}

function setFrequencyFilter(freq) {
  sounds.playClickSound();
  appState.currentFreqFilter = freq;
  document.querySelectorAll('.segmented-control button').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`freq-btn-${freq}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderTasks();
}

// Task Toggle Handler
function toggleTask(id, event) {
  if (event) event.stopPropagation();

  const task = appState.tasks.find(t => t.id === id);
  if (!task) return;

  if (task.completed) {
    updateDynamicIsland('🔒 Zadanie ukończone w tym cyklu!', true);
    setTimeout(() => updateDynamicIsland('Dzisiejszy Focus', false), 2000);
    return;
  }

  task.completed = true;
  const pts = POINT_VALUES[task.frequency] || 1;

  appState.stats.totalPoints += pts;
  appState.stats.completedTasksCount += 1;
  appState.stats.completedByFreq[task.frequency] = (appState.stats.completedByFreq[task.frequency] || 0) + 1;

  const currentKeys = getPeriodKeys();
  let currentKey = currentKeys.dailyKey;
  if (task.frequency === 'weekly') currentKey = currentKeys.weeklyKey;
  if (task.frequency === 'monthly') currentKey = currentKeys.monthlyKey;
  if (task.frequency === 'halfYearly') currentKey = currentKeys.halfYearlyKey;
  if (task.frequency === 'yearly') currentKey = currentKeys.yearlyKey;

  if (task.lastCompletedKey !== currentKey) {
    task.streak = (task.streak || 0) + 1;
    task.lastCompletedKey = currentKey;
  }

  sounds.playCompleteSound(pts);
  
  const posX = event && event.clientX ? event.clientX : window.innerWidth / 2;
  const posY = event && event.clientY ? event.clientY : window.innerHeight / 2;
  spawnPointBurst(`+${pts} pkt!`, posX, posY);

  updateDynamicIsland(`+${pts} pkt! Ukończono!`, true);
  setTimeout(() => updateDynamicIsland('Dzisiejszy Focus', false), 2500);

  saveData();
  renderDashboard();
  renderTasks();
  renderHeader();
  renderStats();
}

function spawnPointBurst(text, x, y) {
  const burst = document.createElement('div');
  burst.className = 'point-burst';
  burst.textContent = text;

  const frame = document.getElementById('app-frame');
  const rect = frame.getBoundingClientRect();

  const posX = (x || rect.width / 2) - rect.left - 30;
  const posY = (y || rect.height / 2) - rect.top - 20;

  burst.style.left = `${posX}px`;
  burst.style.top = `${posY}px`;

  frame.appendChild(burst);
  setTimeout(() => burst.remove(), 1100);
}

// --- Stopwatch & 30s Grace Alarm Handlers ---

function triggerLoudAlarmBanner(limit) {
  updateDynamicIsland(`🚨 ALARM! KONIEC CZASU: ${limit.title}`, true);
  
  limit.alarmActive = true;
  saveData();
  if (appState.currentTab === 'limits') renderLimits();

  sounds.startContinuousAlarm();

  let secondsLeft = 30;

  const existingOverlay = document.getElementById('alarm-active-overlay');
  if (existingOverlay) existingOverlay.remove();

  const alertEl = document.createElement('div');
  alertEl.id = 'alarm-active-overlay';
  alertEl.className = 'alarm-overlay-banner';
  alertEl.innerHTML = `
    <div class="alarm-banner-content">
      <div style="font-size:3rem; margin-bottom:8px;" class="alarm-pulsing-icon">🔊🚨</div>
      <div style="font-size:1.4rem; font-weight:800; color:var(--ios-danger);">KONIEC CZASU!</div>
      <div style="font-size:1rem; font-weight:600; margin-top:6px; color:var(--ios-text-primary);">Limit: ${escapeHtml(limit.title)}</div>
      
      <div style="font-size:0.85rem; margin-top:10px; color:var(--ios-warning); font-weight:700;" id="alarm-countdown-text">
        ⏱️ Wyłącz w ciągu 30s aby uniknąć kary: <span id="alarm-timer-seconds">30</span>s
      </div>

      <button id="dismiss-alarm-btn" class="btn-primary" style="margin-top:16px; background:var(--ios-danger); color:white;">
        Wyłącz Alarm
      </button>
    </div>
  `;
  document.getElementById('app-frame').appendChild(alertEl);

  const stopAlarmSafely = () => {
    sounds.stopContinuousAlarm();
    if (countdownInterval) clearInterval(countdownInterval);
    if (alertEl) alertEl.remove();
    
    if (appState.activeTimers[limit.id]) {
      clearInterval(appState.activeTimers[limit.id]);
      delete appState.activeTimers[limit.id];
    }
    limit.alarmActive = false;
    limit.exceeded = false;
    limit.lastFinishedDailyKey = getPeriodKeys().dailyKey;

    updateDynamicIsland('Wyłączono alarm! ✅', true);
    setTimeout(() => updateDynamicIsland('Dzisiejszy Focus', false), 2500);

    saveData();
    renderDashboard();
    if (appState.currentTab === 'limits') renderLimits();
    renderStats();
  };

  document.getElementById('dismiss-alarm-btn').onclick = stopAlarmSafely;

  // 30-second countdown interval
  const countdownInterval = setInterval(() => {
    secondsLeft -= 1;
    const secSpan = document.getElementById('alarm-timer-seconds');
    if (secSpan) secSpan.textContent = secondsLeft;

    // IF 30 SECONDS EXPIRE WITHOUT TURN OFF: IT OFFICIALLY BECOMES EXCEEDED (-250 PTS)!
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      sounds.stopContinuousAlarm();
      if (alertEl) alertEl.remove();

      if (appState.activeTimers[limit.id]) {
        clearInterval(appState.activeTimers[limit.id]);
        delete appState.activeTimers[limit.id];
      }
      limit.alarmActive = false;
      limit.exceeded = true;
      limit.lastFinishedDailyKey = getPeriodKeys().dailyKey;
      appState.stats.limitsExceededCount += 1;

      // Deduct -250 points penalty
      appState.stats.totalPoints = Math.max(0, appState.stats.totalPoints - 250);

      updateDynamicIsland(`🚨 PRZEKROCZONO LIMIT (-250 pkt): ${limit.title}`, true);
      setTimeout(() => updateDynamicIsland('Dzisiejszy Focus', false), 4000);

      saveData();
      renderHeader();
      renderDashboard();
      if (appState.currentTab === 'limits') renderLimits();
      renderStats();
    }
  }, 1000);
}

function toggleLimitTimer(limitId) {
  sounds.playClickSound();
  const limit = appState.limits.find(l => l.id === limitId);
  if (!limit) return;

  const currentDailyKey = getPeriodKeys().dailyKey;
  if (limit.lastFinishedDailyKey === currentDailyKey || limit.exceeded) {
    updateDynamicIsland('🔒 Limit wykorzystany już w tym dniu!', true);
    setTimeout(() => updateDynamicIsland('Dzisiejszy Focus', false), 2500);
    return;
  }

  if (appState.activeTimers[limitId]) {
    clearInterval(appState.activeTimers[limitId]);
    delete appState.activeTimers[limitId];
    updateDynamicIsland('Stoper zatrzymany', false);
  } else {
    updateDynamicIsland(`⏱️ Mierzę: ${limit.title}`, true);
    appState.stats.limitsTrackedCount += 1;
    saveData();

    appState.activeTimers[limitId] = setInterval(() => {
      limit.usedSeconds = (limit.usedSeconds || 0) + 1;
      
      const targetSec = limit.targetSeconds || 3600;
      if (limit.usedSeconds >= targetSec && !limit.alarmActive && !limit.exceeded) {
        triggerLoudAlarmBanner(limit);
      }
      saveData();
      renderDashboard();
      if (appState.currentTab === 'limits') renderLimits();
    }, 1000);
  }

  renderDashboard();
  renderLimits();
}

// --- Contextual Modal Handlers ---
function setModalTab(type) {
  sounds.playClickSound();
  modalActiveTab = type;

  const taskBtn = document.getElementById('modal-tab-task-btn');
  const limitBtn = document.getElementById('modal-tab-limit-btn');
  const taskFields = document.getElementById('modal-task-fields');
  const limitFields = document.getElementById('modal-limit-fields');

  if (type === 'task') {
    if (taskBtn) taskBtn.classList.add('active');
    if (limitBtn) limitBtn.classList.remove('active');
    if (taskFields) taskFields.style.display = 'block';
    if (limitFields) limitFields.style.display = 'none';
  } else {
    if (limitBtn) limitBtn.classList.add('active');
    if (taskBtn) taskBtn.classList.remove('active');
    if (taskFields) taskFields.style.display = 'none';
    if (limitFields) limitFields.style.display = 'block';
    updateLimitInputMax();
  }
}

function openAddModal() {
  sounds.playClickSound();
  const modal = document.getElementById('add-modal-overlay');
  const segmentedControl = document.getElementById('modal-segmented-control');
  const singleTitle = document.getElementById('modal-single-title');

  if (appState.currentTab === 'dashboard') {
    // Opened from Pulpit: Show both menu tabs (Zadania & Limity)
    if (segmentedControl) segmentedControl.style.display = 'flex';
    if (singleTitle) singleTitle.style.display = 'none';
    setModalTab('task');
  } else if (appState.currentTab === 'tasks') {
    // Opened from Zadania tab: Show ONLY single title "Nowe Zadanie"
    if (segmentedControl) segmentedControl.style.display = 'none';
    if (singleTitle) {
      singleTitle.textContent = 'Nowe Zadanie';
      singleTitle.style.display = 'block';
    }
    setModalTab('task');
  } else if (appState.currentTab === 'limits') {
    // Opened from Limity tab: Show ONLY single title "Nowy Limit Czasowy"
    if (segmentedControl) segmentedControl.style.display = 'none';
    if (singleTitle) {
      singleTitle.textContent = 'Nowy Limit Czasowy';
      singleTitle.style.display = 'block';
    }
    setModalTab('limit');
  }

  modal.classList.add('open');
}

function closeModal() {
  sounds.playClickSound();
  document.getElementById('add-modal-overlay').classList.remove('open');
}

function handleModalSubmit(e) {
  e.preventDefault();
  sounds.playClickSound();

  if (modalActiveTab === 'task') {
    const titleInput = document.getElementById('input-task-title');
    const title = titleInput ? titleInput.value.trim() : '';
    const frequency = document.getElementById('select-task-freq').value;

    if (!title) {
      alert('Proszę wpisać nazwę zadania!');
      return;
    }

    const newTask = {
      id: 't_' + Date.now(),
      title,
      frequency,
      completed: false,
      streak: 0,
      lastCompletedKey: null
    };

    appState.tasks.unshift(newTask);
    if (titleInput) titleInput.value = '';

    setFrequencyFilter(frequency);
    renderDashboard();
    renderTasks();
    renderStats();
  } else {
    const titleInput = document.getElementById('input-limit-title');
    const title = titleInput ? titleInput.value.trim() : '';
    const valInput = document.getElementById('input-limit-target-val');
    let targetVal = parseFloat(valInput ? valInput.value : 2) || 1;
    const unit = document.getElementById('select-limit-unit').value || 'hours';
    const icon = document.getElementById('select-limit-icon').value || '⌛';

    if (!title) {
      alert('Proszę wpisać nazwę limitu!');
      return;
    }

    if (unit === 'hours' && targetVal > 23) targetVal = 23;
    if (unit === 'minutes' && targetVal > 59) targetVal = 59;
    if (unit === 'seconds' && targetVal > 59) targetVal = 59;
    if (targetVal < 1) targetVal = 1;

    let targetSeconds = targetVal * 3600;
    if (unit === 'seconds') targetSeconds = Math.round(targetVal);
    if (unit === 'minutes') targetSeconds = Math.round(targetVal * 60);
    if (unit === 'hours') targetSeconds = Math.round(targetVal * 3600);

    const newLimit = {
      id: 'l_' + Date.now(),
      title,
      targetSeconds,
      usedSeconds: 0,
      unit,
      icon,
      exceeded: false,
      alarmActive: false,
      lastFinishedDailyKey: null
    };

    appState.limits.unshift(newLimit);
    if (titleInput) titleInput.value = '';
    renderDashboard();
    renderLimits();
  }

  saveData();
  closeModal();
}

// --- Settings Handlers ---
function changeLayoutView(e) {
  sounds.playClickSound();
  appState.settings.layoutView = e.target.value;
  applyLayoutView();
  saveData();
}

function changeTheme(e) {
  sounds.playClickSound();
  appState.settings.theme = e.target.value;
  applyTheme();
  saveData();
}

function toggleSound(e) {
  appState.settings.soundEnabled = e.target.checked;
  saveData();
}

function resetAllData() {
  if (confirm("Czy na pewno chcesz zresetować wszystkie dane? Usunie to wszystkie zadania i limity oraz zresetuje punkty do 1000 pkt.")) {
    sounds.playClickSound();
    localStorage.clear();
    appState.tasks = [];
    appState.limits = [];
    appState.stats = {
      totalPoints: 1000,
      completedTasksCount: 0,
      uncompletedTasksCount: 0,
      completedByFreq: { daily: 0, weekly: 0, monthly: 0, halfYearly: 0, yearly: 0 },
      limitsTrackedCount: 0,
      limitsExceededCount: 0
    };
    saveData();
    location.reload();
  }
}

// --- Service Worker & PWA Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Graceful fallback if SW unavailable locally
    });
  });
}

// --- Clock Display ---
function startStatusClock() {
  const clock = document.getElementById('status-bar-time');
  function update() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    if (clock) clock.textContent = `${hrs}:${mins}`;
  }
  update();
  setInterval(update, 1000);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  applyTheme();
  applyLayoutView();
  startStatusClock();
  renderHeader();
  renderDashboard();
});
