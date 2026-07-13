import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Splash screen
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const splash       = document.getElementById('splash-screen');
  const homeScreen   = document.getElementById('home-screen');
  const splashLottie = document.getElementById('splash-lottie');
  const splashDurationMs = 2667;
  let splashHidden   = false;

  const hideSplash = () => {
    if (splashHidden) return;
    splashHidden = true;
    splash.classList.add('splash-hidden');
    homeScreen.classList.add('animate-content');
  };

  if (splashLottie) {
    splashLottie.addEventListener('complete', hideSplash);
    splashLottie.addEventListener('error', () => {
      console.warn('Lottie animation failed to load. Skipping splash screen.');
      hideSplash();
    });
    setTimeout(hideSplash, splashDurationMs);
  } else {
    setTimeout(hideSplash, splashDurationMs);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Drink catalogue & state
// ─────────────────────────────────────────────────────────────────────────────
const DRINKS = [
  { id: 'espresso',        name: 'Espresso',        modifierType: 'shots', variants: [{ modifier: 'single', mg: 65,  label: 'Single' }, { modifier: 'double', mg: 130, label: 'Double' }] },
  { id: 'americano',       name: 'Americano',       modifierType: 'size',  variants: [{ modifier: 'small',  mg: 80,  label: 'Small'  }, { modifier: 'large',  mg: 160, label: 'Large'  }] },
  { id: 'cappuccino',      name: 'Cappuccino',      modifierType: 'shots', variants: [{ modifier: 'single', mg: 65,  label: 'Single' }, { modifier: 'double', mg: 130, label: 'Double' }] },
  { id: 'latte_macchiato', name: 'Latte Macchiato', modifierType: 'shots', variants: [{ modifier: 'single', mg: 65,  label: 'Single' }, { modifier: 'double', mg: 130, label: 'Double' }] },
  { id: 'cafe_crema',      name: 'Cafe Crema',      modifierType: 'size',  variants: [{ modifier: 'small',  mg: 80,  label: 'Small'  }, { modifier: 'large',  mg: 160, label: 'Large'  }] },
  { id: 'filter',          name: 'Filtered Coffee', modifierType: 'size',  variants: [{ modifier: 'small',  mg: 100, label: 'Small'  }, { modifier: 'large',  mg: 200, label: 'Large'  }] },
  { id: 'green_tea',       name: 'Green Tea',       modifierType: 'size',  variants: [{ modifier: 'small',  mg: 30,  label: 'Small'  }, { modifier: 'large',  mg: 40,  label: 'Large'  }] },
  { id: 'black_tea',       name: 'Black Tea',       modifierType: 'size',  variants: [{ modifier: 'small',  mg: 50,  label: 'Small'  }, { modifier: 'large',  mg: 60,  label: 'Large'  }] },
  { id: 'mate',            name: 'Mate',            modifierType: 'size',  variants: [{ modifier: 'small',  mg: 80,  label: 'Small'  }, { modifier: 'large',  mg: 100, label: 'Large'  }] },
  { id: 'matcha',          name: 'Matcha',          modifierType: 'size',  variants: [{ modifier: 'small',  mg: 40,  label: 'Small'  }, { modifier: 'large',  mg: 80,  label: 'Large'  }] },
];

const savedOrder = JSON.parse(localStorage.getItem('caffeine-order')) || DRINKS.map(d => d.id);
const initialDrink = DRINKS.find(d => d.id === savedOrder[0]) || DRINKS[0];
const initialModifier = initialDrink.variants && initialDrink.variants.length > 0 ? initialDrink.variants[0].modifier : null;
const DEFAULT_BEDTIME_MINUTES = 22 * 60;
const savedBedtimeMinutes = Number.parseInt(localStorage.getItem('awake-bedtime-minutes'), 10);
const initialBedtimeMinutes = Number.isFinite(savedBedtimeMinutes)
  ? ((savedBedtimeMinutes % 1440) + 1440) % 1440
  : DEFAULT_BEDTIME_MINUTES;

let state = {
  selectedDrinkId:  initialDrink.id,
  selectedModifier: initialModifier,
  log:        JSON.parse(localStorage.getItem('caffeine-log'))   || [],
  profile:    localStorage.getItem('caffeine-profile')           || 'neutral',
  habit:      localStorage.getItem('caffeine-habit')             || 'regular',
  bedtimeMinutes: initialBedtimeMinutes,
  drinkOrder: savedOrder,
};

let deletedDrinkMemory   = null;
let undoTimeout          = null;
let profileToastTimeout  = null;
let bedtimeInputTimeout  = null;
let scrubX               = null;
let graphTooltip         = null;
let prevBloodMg          = null;
let graphWindowStartMs   = null;
let graphPanStartX       = 0;
let graphPanStartMs      = 0;
let graphIsPanning       = false;

function saveState() {
  localStorage.setItem('caffeine-log',     JSON.stringify(state.log));
  localStorage.setItem('caffeine-profile', state.profile);
  localStorage.setItem('caffeine-habit',   state.habit);
  localStorage.setItem('awake-bedtime-minutes', String(state.bedtimeMinutes));
  localStorage.setItem('caffeine-order',   JSON.stringify(state.drinkOrder));
  updateUI();
}

function getOrderedDrinks() { return state.drinkOrder.map(id => DRINKS.find(d => d.id === id)).filter(Boolean); }
function getCurrentSelectionMg() {
  const orderedDrinks = getOrderedDrinks();
  const drink   = orderedDrinks.find(d => d.id === state.selectedDrinkId) || orderedDrinks[0];
  const variant = drink.variants.find(v => v.modifier === state.selectedModifier) || drink.variants[0];
  return variant.mg;
}
function getHalfLifeMs() {
  let baseHours = 5;
  if (state.profile === 'smoker')   baseHours = 3;
  if (state.profile === 'pregnant') baseHours = 10;
  if (state.habit === 'regular')    baseHours *= 0.75;
  return baseHours * 3600 * 1000;
}
function getSleepSafeThreshold() { return state.habit === 'regular' ? 45 : 25; }

const PEAK_EFFECT_MINS = 45;
const SLEEP_CYCLE_MS = 90 * 60000;
const GRAPH_WINDOW_MS = 6 * 3600000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTodayLogs(logArray = state.log) {
  return logArray.filter(e => new Date(e.time).toDateString() === new Date().toDateString());
}

function minutesToTimeValue(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60).toString().padStart(2, '0');
  const m = (normalized % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function parseTimeValue(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!match) return DEFAULT_BEDTIME_MINUTES;
  const hours = clamp(Number.parseInt(match[1], 10), 0, 23);
  const minutes = clamp(Number.parseInt(match[2], 10), 0, 59);
  return hours * 60 + minutes;
}

function getTargetBedtimeMs(referenceMs = Date.now()) {
  const d = new Date(referenceMs);
  const bedtimeHour = Math.floor(state.bedtimeMinutes / 60);
  const bedtimeMinute = state.bedtimeMinutes % 60;
  d.setHours(bedtimeHour, bedtimeMinute, 0, 0);
  if (referenceMs > d.getTime() + (2 * 3600000)) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function getDefaultGraphStartMs(referenceMs = Date.now()) {
  return referenceMs - (GRAPH_WINDOW_MS / 2);
}

function formatAxisOrientation(timestampMs) {
  const hour = new Date(timestampMs).getHours();
  const displayHour = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${displayHour} ${ampm}`;
}

function getSleepWindowLogs(logArray, bedtimeMs) {
  const windowStart = bedtimeMs - (24 * 3600000);
  const windowEnd = bedtimeMs + (6 * 3600000);
  return logArray.filter(entry => entry.time >= windowStart && entry.time <= windowEnd);
}

function getSleepReadyTime(logArray, fromTimeMs = Date.now(), bedtimeMs = getTargetBedtimeMs(fromTimeMs)) {
  return findFixedDecayTime(getSleepWindowLogs(logArray, bedtimeMs), getSleepSafeThreshold(), fromTimeMs);
}

function getImpactLabel(value) {
  if (value < 0.18) return 'Low';
  if (value < 0.42) return 'Light';
  if (value < 0.78) return 'Moderate';
  return 'High';
}

function getSleepForecast(additionalMg = 0) {
  const now = Date.now();
  const bedtimeMs = getTargetBedtimeMs(now);
  const hypotheticalLog = additionalMg > 0
    ? [...state.log, { time: now, mg: additionalMg }]
    : [...state.log];
  const todayLogs = getSleepWindowLogs(hypotheticalLog, bedtimeMs);
  const threshold = getSleepSafeThreshold();
  const bedtimeMg = getTotalDecayedCaffeine(todayLogs, bedtimeMs);
  const sleepReadyTime = getSleepReadyTime(hypotheticalLog, now, bedtimeMs);
  const lastLog = todayLogs.length
    ? todayLogs.reduce((latest, entry) => entry.time > latest.time ? entry : latest, { time: 0 })
    : null;

  const firstCycleSamples = [];
  const secondCycleSamples = [];
  for (let t = bedtimeMs; t <= bedtimeMs + (2 * SLEEP_CYCLE_MS); t += 15 * 60000) {
    const mg = getTotalDecayedCaffeine(todayLogs, t);
    if (t <= bedtimeMs + SLEEP_CYCLE_MS) firstCycleSamples.push(mg);
    else secondCycleSamples.push(mg);
  }

  const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const firstCycleAvg = avg(firstCycleSamples);
  const secondCycleAvg = avg(secondCycleSamples);
  const bedtimePenalty = clamp((bedtimeMg / Math.max(1, threshold)) * 18, 0, 34);
  const overlapPenalty = clamp(((firstCycleAvg + secondCycleAvg) / Math.max(1, threshold)) * 9, 0, 26);
  const hoursBeforeBed = lastLog ? (bedtimeMs - lastLog.time) / 3600000 : 99;
  const lateDrinkPenalty = clamp((8 - hoursBeforeBed) * 2.3, 0, 18);
  const readyDelayPenalty = sleepReadyTime && sleepReadyTime > bedtimeMs
    ? clamp(((sleepReadyTime - bedtimeMs) / 3600000) * 7, 0, 22)
    : 0;
  const score = Math.round(clamp(100 - bedtimePenalty - overlapPenalty - lateDrinkPenalty - readyDelayPenalty, 0, 100));
  const deepImpactRatio = firstCycleAvg / Math.max(1, threshold);
  const remImpactRatio = secondCycleAvg / Math.max(1, threshold);

  let summary = 'Tonight looks calm. Your caffeine curve fits well with sleep.';
  if (score < 55) summary = 'Tonight may feel restless. Falling asleep and early deep sleep could both be affected.';
  else if (score < 72) summary = 'Falling asleep may be okay, but your first deep sleep phase may be affected.';
  else if (score < 86) summary = 'Good for falling asleep, slightly elevated for deep sleep.';

  return {
    score,
    summary,
    bedtimeMs,
    bedtimeMg: Math.round(bedtimeMg),
    sleepReadyTime,
    deepImpact: getImpactLabel(deepImpactRatio),
    remImpact: getImpactLabel(remImpactRatio),
    deepImpactRatio,
    remImpactRatio,
  };
}

function getCaffeineStatus(currentMg) {
  const threshold = getSleepSafeThreshold();
  if (currentMg <= threshold) {
    return { label: currentMg <= 5 ? 'Sleep ready' : 'Almost sleep ready', detail: 'Below your sleep threshold' };
  }
  if (currentMg <= threshold * 1.6) {
    return { label: 'Winding down', detail: `${Math.ceil(currentMg - threshold)} mg until your sleep threshold` };
  }
  if (currentMg <= threshold * 4) {
    return { label: 'Awake', detail: `${Math.ceil(currentMg - threshold)} mg until your sleep threshold` };
  }
  return { label: 'Focused', detail: `${Math.ceil(currentMg - threshold)} mg until your sleep threshold` };
}

function formatTime(timestampMs) {
  if (!timestampMs) return '—';
  const d    = new Date(timestampMs);
  let h      = d.getHours();
  const m    = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function getTotalDecayedCaffeine(logArray, atTimeMs) {
  let total = 0;
  const halfLife = getHalfLifeMs();
  logArray.forEach(entry => {
    const elapsed = atTimeMs - entry.time;
    if (elapsed >= 0) total += entry.mg * Math.pow(0.5, elapsed / halfLife);
  });
  return total;
}

function findFixedDecayTime(logArray, thresholdMg, fromTimeMs) {
  const stepMs  = 60000;
  const limitMs = 24 * 3600000;
  if (getTotalDecayedCaffeine(logArray, fromTimeMs) <= thresholdMg) return null;
  for (let ms = stepMs; ms <= limitMs; ms += stepMs) {
    const t = fromTimeMs + ms;
    if (getTotalDecayedCaffeine(logArray, t) <= thresholdMg) return t;
  }
  return fromTimeMs + limitMs;
}

function calculateCurrentCaffeine() {
  const now       = Date.now();
  const todayLogs = state.log.filter(e => new Date(e.time).toDateString() === new Date().toDateString());
  return { current: Math.round(getTotalDecayedCaffeine(todayLogs, now)) };
}

function getFixedPredictions(additionalMg) {
  const d = new Date(); d.setSeconds(0, 0);
  const now             = d.getTime();
  const hypotheticalLog = additionalMg > 0
    ? [...state.log, { time: now, mg: additionalMg }]
    : [...state.log];
  const todayLogs       = hypotheticalLog.filter(e => new Date(e.time).toDateString() === new Date().toDateString());
  if (todayLogs.length === 0) return { peak: null, halfLife: null, sleepSafe: null };
  const latestLog       = todayLogs.reduce((latest, entry) => entry.time > latest.time ? entry : latest, { time: 0 });
  const peakTimeMs      = latestLog.time + (PEAK_EFFECT_MINS * 60000);
  const peakMg          = getTotalDecayedCaffeine(todayLogs, peakTimeMs);
  const halfLifeTimeMs  = findFixedDecayTime(todayLogs, peakMg / 2, peakTimeMs);
  const sleepSafeTimeMs = findFixedDecayTime(todayLogs, getSleepSafeThreshold(), now);
  return { peak: peakTimeMs, halfLife: halfLifeTimeMs, sleepSafe: sleepSafeTimeMs };
}

function getPhase(currentMg, todayLogs) {
  if (currentMg < 10 || todayLogs.length === 0) return { label: 'Relax Phase', class: 'phase-relax', id: 'relax' };
  const latestLog      = todayLogs.reduce((latest, entry) => entry.time > latest.time ? entry : latest, { time: 0 });
  const latestPeakTime = latestLog.time + (PEAK_EFFECT_MINS * 60000);
  if (Date.now() < latestPeakTime) return { label: 'Ascending Phase', class: 'phase-ascending', id: 'ascending' };
  return { label: 'Declining Phase', class: 'phase-declining', id: 'declining' };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM references & UI Helpers
// ─────────────────────────────────────────────────────────────────────────────
const els = {
  swipeZone:        document.getElementById('swipe-zone'),
  dots:             document.getElementById('carousel-dots'),
  name:             document.getElementById('drink-name'),
  mg:               document.getElementById('caffeine-mg'),
  caffeineStatus:   document.getElementById('caffeine-status'),
  thresholdDetail:  document.getElementById('caffeine-threshold-detail'),
  modContainer:     document.getElementById('modifier-container'),
  modToggle:        document.getElementById('modifier-toggle'),
  addBtn:           document.getElementById('add-btn'),
  bloodMg:          document.getElementById('current-blood-mg'),
  insightSleep:     document.getElementById('insight-sleep-time'),
  bedtimeCaffeine:  document.getElementById('bedtime-caffeine'),
  deepSleepImpact:  document.getElementById('deep-sleep-impact'),
  remSleepImpact:   document.getElementById('rem-sleep-impact'),
  phaseTag:         document.getElementById('current-phase-tag'),
  graphCanvas:      document.getElementById('caffeine-graph'),
  graphLabels:      document.getElementById('graph-labels'),
  logList:          document.getElementById('log-list'),
  logCard:          document.querySelector('.log-card'),
  logAccordionBtn:  document.getElementById('log-accordion-btn'),
  logAccordionIcon: document.getElementById('log-accordion-icon'),
  canvasContainer:  document.getElementById('canvas-container'),
  undoToast:        document.getElementById('undo-toast'),
  undoBtn:          document.getElementById('undo-btn'),
  profileToast:     document.getElementById('profile-toast'),
  profileToastMsg:  document.getElementById('profile-toast-msg'),
  settingsBtns:     document.querySelectorAll('.open-settings'),
  settingsOverlay:  document.getElementById('settings-overlay'),
  settingsSheet:    document.getElementById('settings-sheet'),
  closeSettingsBtn: document.getElementById('close-settings'),
  profileSelector:  document.getElementById('profile-selector'),
  habitSelector:    document.getElementById('habit-selector'),
  settingsBedtime:  document.getElementById('settings-bedtime'),
  bedtimeOverlay:   document.getElementById('bedtime-overlay'),
  bedtimeSheet:     document.getElementById('bedtime-sheet'),
  firstBedtime:     document.getElementById('first-bedtime'),
  firstProfileSelector: document.getElementById('first-profile-selector'),
  firstHabitSelector:   document.getElementById('first-habit-selector'),
  saveBedtimeBtn:   document.getElementById('save-bedtime'),
  sortableList:     document.getElementById('sortable-drinks'),
  bottomNav:        document.querySelector('.bottom-nav'),
  navLogBtn:        document.getElementById('nav-log-btn'),
  navSleepBtn:      document.getElementById('nav-sleep-btn'),
};

function triggerFullAnimation() {
  els.name.classList.remove('fade-slide'); els.mg.classList.remove('fade-slide');
  void els.name.offsetWidth;
  els.name.classList.add('fade-slide'); els.mg.classList.add('fade-slide');
}

function triggerNumberAnimation() {
  els.mg.classList.remove('fade-slide');
  void els.mg.offsetWidth;
  els.mg.classList.add('fade-slide');
}

function fitDrinkName() {
  if (!els.name) return;
  const parent = els.name.parentElement;
  if (!parent) return;
  parent.style.removeProperty('--drink-title-fit-size');
  const styles = getComputedStyle(parent);
  const baseSize = parseFloat(styles.fontSize) || 32;
  const minSize = 20;
  const availableWidth = parent.clientWidth;
  if (!availableWidth) return;
  const ratio = availableWidth / Math.max(1, els.name.scrollWidth);
  const fitSize = Math.max(minSize, Math.min(baseSize, Math.floor(baseSize * ratio)));
  parent.style.setProperty('--drink-title-fit-size', `${fitSize}px`);
}

function selectDrink(index) {
  const orderedDrinks    = getOrderedDrinks();
  const drink            = orderedDrinks[index];
  if (!drink) return;
  state.selectedDrinkId  = drink.id;
  state.selectedModifier = drink.variants[0].modifier;
  switch3DModel(drink.id);
  triggerFullAnimation();
  updateUI();
}

function renderCarouselDots() {
  els.dots.innerHTML = '';
  getOrderedDrinks().forEach((drink, index) => {
    const dot     = document.createElement('div');
    dot.className = 'dot';
    dot.onclick   = () => selectDrink(index);
    els.dots.appendChild(dot);
  });
}

function renderModifierToggle(drink) {
  els.modToggle.innerHTML = '';
  if (!drink.variants || drink.variants.length < 2) {
    els.modContainer.classList.add('hidden');
    return;
  }
  els.modContainer.classList.remove('hidden');
  const bg          = document.createElement('div');
  bg.className      = 'mod-bg';
  const activeIndex = drink.variants.findIndex(v => v.modifier === state.selectedModifier);
  bg.style.transform = `translateX(${Math.max(0, activeIndex) * 100}%)`;
  els.modToggle.appendChild(bg);
  drink.variants.forEach(variant => {
    const btn      = document.createElement('button');
    btn.className  = `mod-btn ${state.selectedModifier === variant.modifier ? 'active' : ''}`;
    btn.textContent = variant.label.toLowerCase();
    btn.onclick    = () => { state.selectedModifier = variant.modifier; triggerNumberAnimation(); updateUI(); };
    els.modToggle.appendChild(btn);
  });
}

let currentTab = 0;
const slider  = document.getElementById('screen-slider');
const screens = [document.getElementById('home-screen'), document.getElementById('insights-screen')];
function updateBottomNav() {
  const isHome = currentTab === 0;
  els.navLogBtn?.classList.toggle('active', isHome);
  els.navSleepBtn?.classList.toggle('active', !isHome);
  els.bottomNav?.classList.toggle('sleep-active', !isHome);
}

function switchToTab(tabIndex) {
  currentTab = tabIndex;
  slider.style.transform = `translateX(-${tabIndex * 50}%)`;
  screens.forEach(s => s.classList.remove('animate-content'));
  const activeScreen = screens[tabIndex];
  void activeScreen.offsetWidth;
  activeScreen.classList.add('animate-content');

  updateBottomNav();
  setTimeout(updateUI, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings panel
// ─────────────────────────────────────────────────────────────────────────────
function initSettings() {
  els.settingsBtns.forEach(btn => {
    btn.onclick = () => {
      if (els.settingsBedtime) els.settingsBedtime.value = minutesToTimeValue(state.bedtimeMinutes);
      els.settingsOverlay.classList.remove('hidden');
      els.settingsSheet.classList.remove('hidden');
      renderSortableList();
    };
  });

  const closeSettings = () => {
    els.settingsOverlay.classList.add('hidden');
    els.settingsSheet.classList.add('hidden');
  };
  els.closeSettingsBtn.onclick = closeSettings;
  els.settingsOverlay.onclick  = closeSettings;

  const activeProfileRadio = els.profileSelector.querySelector(`input[value="${state.profile}"]`);
  if (activeProfileRadio) activeProfileRadio.checked = true;
  const activeHabitRadio = els.habitSelector.querySelector(`input[value="${state.habit}"]`);
  if (activeHabitRadio) activeHabitRadio.checked = true;
  if (els.settingsBedtime) els.settingsBedtime.value = minutesToTimeValue(state.bedtimeMinutes);

  const showSettingsToast = (message = null) => {
    const h  = getHalfLifeMs() / (3600 * 1000);
    const mg = getSleepSafeThreshold();
    els.profileToastMsg.textContent = message || `Updated: half-life ${h}h, threshold ${mg}mg`;
    els.profileToast.classList.add('visible');
    clearTimeout(profileToastTimeout);
    profileToastTimeout = setTimeout(() => els.profileToast.classList.remove('visible'), 3500);
  };

  els.profileSelector.addEventListener('change', e => { state.profile = e.target.value; saveState(); showSettingsToast(); });
  els.habitSelector.addEventListener('change',   e => { state.habit   = e.target.value; saveState(); showSettingsToast(); });
  const updateSettingsBedtime = (showToast = true) => {
    if (!els.settingsBedtime) return;
    const nextBedtime = parseTimeValue(els.settingsBedtime.value);
    if (nextBedtime === state.bedtimeMinutes) return;
    state.bedtimeMinutes = nextBedtime;
    els.settingsBedtime.value = minutesToTimeValue(state.bedtimeMinutes);
    graphWindowStartMs = null;
    saveState();
    if (showToast) showSettingsToast('Bedtime updated!');
  };
  const scheduleSettingsBedtimeUpdate = () => {
    clearTimeout(bedtimeInputTimeout);
    bedtimeInputTimeout = setTimeout(() => updateSettingsBedtime(true), 1200);
  };
  els.settingsBedtime?.addEventListener('input', scheduleSettingsBedtimeUpdate);
  els.settingsBedtime?.addEventListener('change', scheduleSettingsBedtimeUpdate);
  els.settingsBedtime?.addEventListener('blur', () => {
    clearTimeout(bedtimeInputTimeout);
    updateSettingsBedtime(true);
  });

  els.sortableList.addEventListener('dragover', e => {
    e.preventDefault();
    const afterElement = getDragAfterElement(els.sortableList, e.clientY);
    const draggable    = document.querySelector('.dragging');
    if (draggable) {
      if (afterElement == null) els.sortableList.appendChild(draggable);
      else els.sortableList.insertBefore(draggable, afterElement);
    }
  });
}

function initBedtimePrompt() {
  if (localStorage.getItem('awake-setup-complete') === 'true') return;
  if (!els.bedtimeOverlay || !els.bedtimeSheet || !els.firstBedtime || !els.saveBedtimeBtn) return;

  els.firstBedtime.value = minutesToTimeValue(state.bedtimeMinutes);
  const firstProfileRadio = els.firstProfileSelector?.querySelector(`input[value="${state.profile}"]`);
  if (firstProfileRadio) firstProfileRadio.checked = true;
  const firstHabitRadio = els.firstHabitSelector?.querySelector(`input[value="${state.habit}"]`);
  if (firstHabitRadio) firstHabitRadio.checked = true;
  els.bedtimeOverlay.classList.remove('hidden');
  els.bedtimeSheet.classList.remove('hidden');

  els.saveBedtimeBtn.addEventListener('click', () => {
    const selectedProfile = els.firstProfileSelector?.querySelector('input:checked');
    const selectedHabit = els.firstHabitSelector?.querySelector('input:checked');
    if (selectedProfile) state.profile = selectedProfile.value;
    if (selectedHabit) state.habit = selectedHabit.value;
    state.bedtimeMinutes = parseTimeValue(els.firstBedtime.value);
    els.firstBedtime.value = minutesToTimeValue(state.bedtimeMinutes);
    if (els.settingsBedtime) els.settingsBedtime.value = els.firstBedtime.value;
    const activeProfileRadio = els.profileSelector?.querySelector(`input[value="${state.profile}"]`);
    if (activeProfileRadio) activeProfileRadio.checked = true;
    const activeHabitRadio = els.habitSelector?.querySelector(`input[value="${state.habit}"]`);
    if (activeHabitRadio) activeHabitRadio.checked = true;
    graphWindowStartMs = null;
    localStorage.setItem('awake-setup-complete', 'true');
    saveState();
    els.bedtimeOverlay.classList.add('hidden');
    els.bedtimeSheet.classList.add('hidden');
  });
}

function saveDrinkOrder() {
  const items      = [...els.sortableList.querySelectorAll('.sortable-item')];
  state.drinkOrder = items.map(item => item.dataset.id);
  saveState();
  renderCarouselDots();
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box    = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function renderSortableList() {
  els.sortableList.innerHTML = '';
  getOrderedDrinks().forEach(drink => {
    const li      = document.createElement('li');
    li.className  = 'sortable-item';
    li.dataset.id = drink.id;
    li.draggable  = true;
    li.innerHTML  = `<span style="font-weight:600;font-size:15px;">${drink.name}</span><div class="drag-handle">≡</div>`;
    li.addEventListener('dragstart', () => li.classList.add('dragging'));
    li.addEventListener('dragend',   () => { li.classList.remove('dragging'); saveDrinkOrder(); });
    li.addEventListener('touchstart', e => {
      if (e.target.closest('.drag-handle')) { li.classList.add('dragging'); document.body.style.overflow = 'hidden'; }
    }, { passive: false });
    li.addEventListener('touchmove', e => {
      if (li.classList.contains('dragging')) {
        e.preventDefault();
        const afterElement = getDragAfterElement(els.sortableList, e.touches[0].clientY);
        if (afterElement == null) els.sortableList.appendChild(li);
        else els.sortableList.insertBefore(li, afterElement);
      }
    }, { passive: false });
    li.addEventListener('touchend', () => {
      if (li.classList.contains('dragging')) { li.classList.remove('dragging'); document.body.style.overflow = ''; saveDrinkOrder(); }
    });
    els.sortableList.appendChild(li);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — state variables
// ─────────────────────────────────────────────────────────────────────────────
let scene, camera, renderer, currentModelGroup;

let rotX = 0.35, rotY = 0;
let rotVelX = 0,  rotVelY = 0;
let rotDragging = false;
let rotLastX = 0, rotLastY = 0;

let modelSwitchToken      = 0;
let carouselModels        = [];
let carouselDragProgress  = 0;
let modelBounceStart      = 0;
const CAROUSEL_SPACING    = 2.25;
const PHONE_CAROUSEL_SPACING = 3.15;
const PHONE_MODEL_SCALE_MULTIPLIER = 1.5;
const MODEL_Y_OFFSET = -0.30;
const PHONE_MODEL_Y_OFFSET = -0.04;

function getCarouselLayout() {
  const isPhone = window.matchMedia('(max-width: 519px)').matches;
  return {
    spacing: isPhone ? PHONE_CAROUSEL_SPACING : CAROUSEL_SPACING,
    scaleMultiplier: isPhone ? PHONE_MODEL_SCALE_MULTIPLIER : 1,
    yOffset: isPhone ? PHONE_MODEL_Y_OFFSET : MODEL_Y_OFFSET,
  };
}

function triggerModelBounce() {
  modelBounceStart = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// UI init
// ─────────────────────────────────────────────────────────────────────────────
function initUI() {
  renderCarouselDots();
  initSettings();
  initBedtimePrompt();

  const tooltip = document.getElementById('modifier-tooltip');
  const closeTooltipBtn = document.getElementById('close-tooltip');
  if (!localStorage.getItem('awake-tooltip-seen')) {
    tooltip.classList.remove('hidden');
  }
  closeTooltipBtn.addEventListener('click', () => {
    tooltip.classList.add('hidden');
    localStorage.setItem('awake-tooltip-seen', 'true');
  });

  const logoImg      = document.getElementById('logo-img');

  [
    'icons/awake_word_mark_green.svg',
    'icons/arrow_black.svg',
    'icons/arrow_green.svg',
  ].forEach(src => {
    const img = new Image(); img.src = src;
  });

  const setupImageSwap = (element, defaultSrc, activeSrc) => {
    if (!element) return;
    const setHover  = () => (element.src = activeSrc);
    const setNormal = () => (element.src = defaultSrc);
    element.addEventListener('touchstart',  setHover,  { passive: true });
    element.addEventListener('touchend',    setNormal);
    element.addEventListener('touchcancel', setNormal);
    element.addEventListener('mousedown',   setHover);
    element.addEventListener('mouseup',     setNormal);
    element.addEventListener('mouseleave',  setNormal);
  };

  setupImageSwap(logoImg,      'icons/awake_word_mark.svg',    'icons/awake_word_mark_green.svg');

  const logoBtn = document.getElementById('logo-btn');
  logoBtn.addEventListener('click', () => {
    logoBtn.classList.remove('logo-shake');
    void logoBtn.offsetWidth;
    logoBtn.classList.add('logo-shake');
  });
  logoBtn.addEventListener('animationend', () => logoBtn.classList.remove('logo-shake'));

  const setupNavButton = (button, tabIndex) => {
    if (!button) return;
    const press = () => button.classList.add('is-pressing');
    const release = () => button.classList.remove('is-pressing');
    button.addEventListener('mousedown', press);
    button.addEventListener('touchstart', press, { passive: true });
    button.addEventListener('mouseup', release);
    button.addEventListener('mouseleave', release);
    button.addEventListener('touchend', release);
    button.addEventListener('touchcancel', release);
    button.addEventListener('click', () => switchToTab(tabIndex));
  };

  setupNavButton(els.navLogBtn, 0);
  setupNavButton(els.navSleepBtn, 1);
  updateBottomNav();

  let swipeStartX      = 0;
  let swipeStartY      = 0;
  let isPointerDown    = false;
  let interactionMode  = 'none';
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();

  const handlePointerStart = (clientX, clientY) => {
    const rect  = els.canvasContainer.getBoundingClientRect();
    mouse.x     = ((clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y     = -((clientY - rect.top)  / rect.height) * 2 + 1;
    interactionMode = 'carousel';
    
    if (camera && currentModelGroup) {
      raycaster.setFromCamera(mouse, camera);
      if (raycaster.intersectObject(currentModelGroup, true).length > 0) {
        interactionMode = 'rotate-candidate';
      }
    }
    
    swipeStartX     = clientX;
    swipeStartY     = clientY;
    carouselDragProgress = 0;
    isPointerDown   = true;
    rotLastX = clientX; rotLastY = clientY;
    rotDragging = false;
    rotVelX = 0; rotVelY = 0;
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!isPointerDown) return;
    const dx = clientX - swipeStartX;
    const dy = clientY - swipeStartY;

    if (interactionMode === 'rotate-candidate') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        interactionMode = 'carousel';
      } else {
        interactionMode = 'rotate';
        rotDragging = true;
      }
    }

    if (interactionMode === 'carousel') {
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        const orderedDrinks = getOrderedDrinks();
        const currentIndex  = orderedDrinks.findIndex(d => d.id === state.selectedDrinkId);
        const canMovePrev   = currentIndex > 0;
        const canMoveNext   = currentIndex < orderedDrinks.length - 1;
        const rawProgress   = dx / Math.max(1, els.canvasContainer.clientWidth * 0.58);
        const minProgress   = canMoveNext ? -1 : -0.12;
        const maxProgress   = canMovePrev ? 1 : 0.12;
        carouselDragProgress = clamp(rawProgress, minProgress, maxProgress);
        updateCarouselModelTransforms();
      }
    } else if (interactionMode === 'rotate') {
      const frameDx = clientX - rotLastX;
      const frameDy = clientY - rotLastY;
      rotY += frameDx * 0.006; 
      rotX += frameDy * 0.003; 
      rotX = Math.max(-0.7, Math.min(0.7, rotX));
      rotVelX = frameDx; rotVelY = frameDy;
      rotLastX = clientX; rotLastY = clientY;
    }
  };

  const handlePointerEnd = () => {
    if (interactionMode === 'carousel') {
      const orderedDrinks = getOrderedDrinks();
      const currentIndex  = orderedDrinks.findIndex(d => d.id === state.selectedDrinkId);
      let nextIndex       = currentIndex;
      if (carouselDragProgress < -0.32) nextIndex = currentIndex + 1;
      else if (carouselDragProgress > 0.32) nextIndex = currentIndex - 1;
      if (nextIndex >= 0 && nextIndex < orderedDrinks.length && nextIndex !== currentIndex) {
        selectDrink(nextIndex);
      } else {
        carouselDragProgress = 0;
        updateCarouselModelTransforms();
      }
    } else if (interactionMode === 'rotate-candidate') {
      triggerModelBounce();
    }
    isPointerDown = false;
    rotDragging = false;
    interactionMode = 'none';
  };

  els.swipeZone.addEventListener('touchstart', e => handlePointerStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  els.swipeZone.addEventListener('touchmove',  e => handlePointerMove(e.touches[0].clientX,  e.touches[0].clientY), { passive: true });
  els.swipeZone.addEventListener('touchend',   handlePointerEnd);
  els.swipeZone.addEventListener('mousedown',  e => handlePointerStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => { if (isPointerDown) handlePointerMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   handlePointerEnd);

  els.addBtn.onclick = () => {
    const orderedDrinks = getOrderedDrinks();
    const drink         = orderedDrinks.find(d => d.id === state.selectedDrinkId);
    const mg            = getCurrentSelectionMg();
    const logName       = state.selectedModifier
      ? `${state.selectedModifier.charAt(0).toUpperCase() + state.selectedModifier.slice(1)} ${drink.name}`
      : drink.name;
    
    state.log.push({ id: Date.now(), name: logName, mg, time: Date.now() });
    saveState();
    
    els.addBtn.textContent = '✓ Added';
    els.addBtn.classList.add('success');
    
    setTimeout(() => { 
      switchToTab(1); 
      setTimeout(() => {
        els.addBtn.textContent = '+ Add'; 
        els.addBtn.classList.remove('success'); 
      }, 400);
    }, 500);
  };

  els.logList.addEventListener('click', e => {
    if (e.target.classList.contains('delete-btn')) {
      const id     = parseInt(e.target.getAttribute('data-id'));
      const itemEl = e.target.closest('.log-item');
      itemEl.classList.add('deleting');
      setTimeout(() => {
        deletedDrinkMemory = state.log.find(log => log.id === id);
        state.log          = state.log.filter(log => log.id !== id);
        saveState();
        showUndoToast();
      }, 300);
    }
  });

  els.logAccordionBtn?.addEventListener('click', () => {
    if (!els.logCard) return;
    const isCollapsed = els.logCard.classList.toggle('collapsed');
    els.logAccordionBtn.setAttribute('aria-expanded', String(!isCollapsed));
    if (els.logAccordionIcon) {
      els.logAccordionIcon.src = 'icons/arrow_green.svg';
      setTimeout(() => { els.logAccordionIcon.src = 'icons/arrow_black.svg'; }, 180);
    }
  });

  const setLogAccordionIcon = src => {
    if (els.logAccordionIcon) els.logAccordionIcon.src = src;
  };
  els.logAccordionBtn?.addEventListener('pointerdown', () => setLogAccordionIcon('icons/arrow_green.svg'));
  els.logAccordionBtn?.addEventListener('pointerup', () => setLogAccordionIcon('icons/arrow_black.svg'));
  els.logAccordionBtn?.addEventListener('pointerleave', () => setLogAccordionIcon('icons/arrow_black.svg'));
  els.logAccordionBtn?.addEventListener('pointercancel', () => setLogAccordionIcon('icons/arrow_black.svg'));

  function showUndoToast() {
    els.undoToast.classList.add('visible');
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => { els.undoToast.classList.remove('visible'); deletedDrinkMemory = null; }, 4000);
  }

  els.undoBtn.onclick = () => {
    if (deletedDrinkMemory) {
      state.log.push(deletedDrinkMemory);
      state.log.sort((a, b) => a.time - b.time);
      saveState();
      els.undoToast.classList.remove('visible');
      deletedDrinkMemory = null;
    }
  };

  const handleGraphPanStart = clientX => {
    graphIsPanning = true;
    graphPanStartX = clientX;
    graphPanStartMs = graphWindowStartMs ?? getDefaultGraphStartMs();
    const rect = els.graphCanvas.getBoundingClientRect();
    scrubX = clamp(clientX - rect.left, 0, rect.width);
    graphTooltip = null;
    updateUI();
  };
  const handleGraphPanMove = clientX => {
    if (!graphIsPanning) return;
    const rect = els.graphCanvas.getBoundingClientRect();
    const dx = clientX - graphPanStartX;
    graphWindowStartMs = graphPanStartMs - (dx / Math.max(1, rect.width)) * GRAPH_WINDOW_MS;
    scrubX = clamp(clientX - rect.left, 0, rect.width);
    graphTooltip = null;
    updateUI();
  };
  const handleGraphPanEnd = () => {
    graphIsPanning = false;
  };
  const handleGraphClick = e => {
    const canvas = els.graphCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    const nowMs = Date.now();
    const viewStart = graphWindowStartMs ?? getDefaultGraphStartMs();
    const viewEnd = viewStart + GRAPH_WINDOW_MS;
    const bedtimeMs = getTargetBedtimeMs(nowMs);
    const sleepLogs = getSleepWindowLogs(state.log, bedtimeMs);
    const threshold = getSleepSafeThreshold();
    const graphTop = 4;
    const graphBottom = height - 6;
    const graphHeight = Math.max(120, graphBottom - graphTop);
    const samples = Array.from({ length: 96 }, (_, i) => {
      const time = viewStart + ((viewEnd - viewStart) * (i / 95));
      return getTotalDecayedCaffeine(sleepLogs, time);
    });
    const maxMg = Math.max(60, threshold * 1.9, ...samples) * 1.04;
    const toX = time => ((time - viewStart) / (viewEnd - viewStart)) * width;
    const toY = mg => graphTop + graphHeight - ((mg / maxMg) * graphHeight);
    const markerHit = (x, y) => Math.hypot(clickX - x, clickY - y) <= 18;

    if (nowMs >= viewStart && nowMs <= viewEnd) {
      const currentX = clamp(toX(nowMs), 1, width - 1);
      const currentY = toY(calculateCurrentCaffeine().current);
      if (markerHit(currentX, currentY)) {
        scrubX = null;
        graphTooltip = { x: currentX, y: currentY, text: 'This is your current caffeine level' };
        updateUI();
        return;
      }
    }

    if (bedtimeMs >= viewStart && bedtimeMs <= viewEnd) {
      const bedX = clamp(toX(bedtimeMs), 1, width - 1);
      const bedtimeMg = Math.round(getTotalDecayedCaffeine(sleepLogs, bedtimeMs));
      const bedY = toY(bedtimeMg);
      if (markerHit(bedX, bedY)) {
        scrubX = null;
        graphTooltip = { x: bedX, y: bedY, text: `This is your level at bedtime: ${bedtimeMg} mg` };
        updateUI();
        return;
      }
    }

    graphTooltip = null;
    scrubX = clamp(clickX, 0, width);
    updateUI();
  };
  els.graphCanvas.addEventListener('touchstart', e => handleGraphPanStart(e.touches[0].clientX), { passive: true });
  els.graphCanvas.addEventListener('touchmove',  e => handleGraphPanMove(e.touches[0].clientX), { passive: true });
  els.graphCanvas.addEventListener('touchend',   handleGraphPanEnd);
  els.graphCanvas.addEventListener('mousedown',  e => handleGraphPanStart(e.clientX));
  els.graphCanvas.addEventListener('mousemove',  e => handleGraphPanMove(e.clientX));
  els.graphCanvas.addEventListener('mouseup',    handleGraphPanEnd);
  els.graphCanvas.addEventListener('click',      handleGraphClick);
  els.graphCanvas.addEventListener('mouseleave', handleGraphPanEnd);
  els.graphCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    graphWindowStartMs = (graphWindowStartMs ?? getDefaultGraphStartMs()) + e.deltaY * 60000;
    updateUI();
  }, { passive: false });
  document.addEventListener('pointerdown', e => {
    if (!els.graphCanvas || e.target === els.graphCanvas) return;
    if (scrubX === null && graphTooltip === null) return;
    scrubX = null;
    graphTooltip = null;
    updateUI();
  });

  updateUI();
  setInterval(updateUI, 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar Graph drawing
// ─────────────────────────────────────────────────────────────────────────────
function drawGraph(todayLogs, currentMg, sleepForecast) {
  const canvas = els.graphCanvas;
  if (!canvas || canvas.offsetParent === null) return;
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const rect   = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const width  = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const nowMs = Date.now();
  if (graphWindowStartMs === null) graphWindowStartMs = getDefaultGraphStartMs();
  const viewStart = graphWindowStartMs;
  const viewEnd = viewStart + GRAPH_WINDOW_MS;
  const bedtimeMs = sleepForecast?.bedtimeMs || getTargetBedtimeMs();
  const threshold  = getSleepSafeThreshold();
  const graphTop = 4;
  const graphBottom = height - 6;
  const graphHeight = Math.max(120, graphBottom - graphTop);
  const toX = time => ((time - viewStart) / (viewEnd - viewStart)) * width;

  const numPoints = 144;
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const time = viewStart + ((viewEnd - viewStart) * (i / (numPoints - 1)));
    points.push({ time, mg: getTotalDecayedCaffeine(todayLogs, time) });
  }

  const maxMg = Math.max(60, threshold * 1.9, ...points.map(p => p.mg)) * 1.04;
  const toY = mg => graphTop + graphHeight - ((mg / maxMg) * graphHeight);

  const phasePattern = [
    { name: 'Light sleep', color: 'rgba(255, 255, 255, 0.46)', level: 0.30, length: 30 },
    { name: 'Deep sleep', color: 'rgba(73, 204, 56, 0.16)', level: 0.72, length: 35 },
    { name: 'REM sleep', color: 'rgba(0, 0, 0, 0.06)', level: 0.48, length: 25 },
  ];

  ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.beginPath();
  ctx.rect(0, graphTop, width, graphHeight);
  ctx.fill();

  let phaseStart = bedtimeMs;
  const nightEnd = bedtimeMs + (8 * 3600000);
  let phaseIndex = 0;
  const renderedPhaseLabels = new Set();
  while (phaseStart < viewEnd && phaseStart < nightEnd) {
    const phase = phasePattern[Math.abs(phaseIndex) % phasePattern.length];
    const phaseEnd = Math.min(viewEnd, nightEnd, phaseStart + phase.length * 60000);
    const x = clamp(toX(phaseStart), 0, width);
    const x2 = clamp(toX(phaseEnd), 0, width);
    const y = graphTop + (graphHeight * phase.level);
    const h = phase.level > 0.6 ? graphHeight * 0.22 : graphHeight * 0.16;
    if (x2 > 0 && x < width) {
      ctx.fillStyle = phase.color;
      ctx.beginPath();
      ctx.rect(x, y - h / 2, Math.max(1, x2 - x - 2), h);
      ctx.fill();
      ctx.fillStyle = 'rgba(152, 152, 157, 0.92)';
      ctx.font = '700 10px "Open Sans", sans-serif';
      ctx.textBaseline = 'middle';
      if (!renderedPhaseLabels.has(phase.name)) {
        renderedPhaseLabels.add(phase.name);
        const labelX = clamp(x + 6, 6, width - ctx.measureText(phase.name).width - 6);
        ctx.fillText(phase.name, labelX, y);
      }
    }
    phaseStart = phaseEnd;
    phaseIndex += 1;
  }

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = toX(p.time);
    const y = toY(p.mg);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(150, 150, 154, 0.72)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.stroke();

  if (bedtimeMs >= viewStart && bedtimeMs <= viewEnd) {
    const bedX = clamp(toX(bedtimeMs), 1, width - 1);
    const bedY = toY(getTotalDecayedCaffeine(todayLogs, bedtimeMs));
    ctx.beginPath();
    ctx.arc(bedX, bedY, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  }

  if (scrubX !== null) {
    const timeAtScrub = viewStart + (scrubX / width) * (viewEnd - viewStart);
    const mgAtScrub   = getTotalDecayedCaffeine(todayLogs, timeAtScrub);
    const scrubY      = toY(mgAtScrub);

    ctx.beginPath();
    ctx.arc(scrubX, scrubY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#888888'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();

    ctx.font      = '700 12px "Space Mono", monospace';
    const text      = `${Math.round(mgAtScrub)} mg`;
    const tooltipPaddingX = 10;
    const tooltipHeight = 30;
    const tooltipWidth = ctx.measureText(text).width + (tooltipPaddingX * 2);
    const tooltipX = clamp(scrubX - tooltipWidth / 2, 4, width - tooltipWidth - 4);
    const tooltipY = clamp(scrubY - tooltipHeight - 12, 4, height - tooltipHeight - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 12);
    else ctx.rect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tooltipX + tooltipPaddingX, tooltipY + tooltipHeight / 2);
  }

  if (nowMs >= viewStart && nowMs <= viewEnd) {
    const currentX = clamp(toX(nowMs), 1, width - 1);
    const currentY = toY(currentMg);
    ctx.beginPath();
    ctx.arc(currentX, currentY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#49cc38';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  }

  if (graphTooltip) {
    const tooltipPaddingX = 10;
    const tooltipHeight = 32;
    ctx.font = '700 11px "Open Sans", sans-serif';
    const tooltipWidth = ctx.measureText(graphTooltip.text).width + (tooltipPaddingX * 2);
    const tooltipX = clamp(graphTooltip.x - tooltipWidth / 2, 4, width - tooltipWidth - 4);
    const tooltipY = clamp(graphTooltip.y - tooltipHeight - 12, 4, height - tooltipHeight - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 12);
    else ctx.rect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(graphTooltip.text, tooltipX + tooltipPaddingX, tooltipY + tooltipHeight / 2);
  }

  if (els.graphLabels) {
    const axisItems = [];
    const twoHoursMs = 2 * 3600000;
    const firstTick = Math.ceil(viewStart / twoHoursMs) * twoHoursMs;
    for (let t = firstTick; t <= viewEnd; t += twoHoursMs) {
      let className = '';
      if (Math.abs(t - viewStart) < 60000) className = 'axis-edge-start';
      if (Math.abs(t - viewEnd) < 60000) className = 'axis-edge-end';
      axisItems.push({ time: t, text: formatAxisOrientation(t), className });
    }

    els.graphLabels.innerHTML = '';
    axisItems.forEach(item => {
      const label = document.createElement('span');
      label.textContent = item.text;
      label.className = item.className;
      label.style.left = `${clamp(((item.time - viewStart) / GRAPH_WINDOW_MS) * 100, 0, 100)}%`;
      els.graphLabels.appendChild(label);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main UI update
// ─────────────────────────────────────────────────────────────────────────────
function updateUI() {
  const orderedDrinks = getOrderedDrinks();
  const drink         = orderedDrinks.find(d => d.id === state.selectedDrinkId) || orderedDrinks[0];
  const selectedMg    = getCurrentSelectionMg();
  const todayLogs     = getTodayLogs();
  const physio        = calculateCurrentCaffeine();
  const status        = getCaffeineStatus(physio.current);
  const currentForecast = getSleepForecast(0);
  const sleepWindowLogs = getSleepWindowLogs(state.log, currentForecast.bedtimeMs);

  Array.from(els.dots.children).forEach((dot, i) => {
    dot.classList.toggle('active', orderedDrinks[i] && orderedDrinks[i].id === drink.id);
  });

  renderModifierToggle(drink);
  els.name.textContent = drink.name;
  fitDrinkName();
  els.mg.textContent   = selectedMg;
  if (els.caffeineStatus) els.caffeineStatus.textContent = status.label;
  if (els.thresholdDetail) els.thresholdDetail.textContent = status.detail;

  if (prevBloodMg !== null && prevBloodMg !== physio.current) {
    els.bloodMg.classList.add('flash-green');
    setTimeout(() => els.bloodMg.classList.remove('flash-green'), 500);
  }
  prevBloodMg = physio.current;
  els.bloodMg.textContent = `${physio.current}`;

  els.insightSleep.textContent = `${currentForecast.score}/100`;
  if (els.bedtimeCaffeine) els.bedtimeCaffeine.textContent = `${currentForecast.bedtimeMg} mg`;
  if (els.deepSleepImpact) els.deepSleepImpact.textContent = currentForecast.deepImpact;
  if (els.remSleepImpact) els.remSleepImpact.textContent = currentForecast.remImpact;

  const phase             = getPhase(physio.current, todayLogs);
  if (els.phaseTag) {
    els.phaseTag.textContent = phase.label;
    els.phaseTag.className  = `phase-tag ${phase.class}`;
  }

  els.logList.innerHTML = '';
  if (todayLogs.length === 0) {
    els.logList.innerHTML = '<p style="color:#8E8E93;font-size:14px;text-align:center;">No drinks today.</p>';
  } else {
    [...todayLogs].reverse().forEach(e => {
      const item     = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-info">
          <span class="log-name">${e.name}</span>
          <span class="log-mg">${e.mg} mg</span>
        </div>
        <div style="display:flex;align-items:center;">
          <span class="log-time">${formatTime(e.time)}</span>
          <button class="delete-btn" data-id="${e.id}">×</button>
        </div>`;
      els.logList.appendChild(item);
    });
  }

  drawGraph(sleepWindowLogs, physio.current, currentForecast);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — model catalogue
// ─────────────────────────────────────────────────────────────────────────────
const glbCache   = {};
const gltfLoader = new GLTFLoader();

const DRINK_3D = {
  espresso:        { file: 'models/espresso.glb',        scale: 0.64 },
  americano:       { file: 'models/americano.glb',       scale: 0.8 },
  cappuccino:      { file: 'models/cappuccino.glb',      scale: 0.72 },
  latte_macchiato: { file: 'models/latte_macchiato.glb', scale: 0.81, rotationY: -Math.PI / 6 },
  cafe_crema:      { file: 'models/cafe_crema.glb',      scale: 0.8 },
  filter:          { file: 'models/filtered_coffee.glb', scale: 0.72 },
  green_tea:       { file: 'models/tea_green.glb',       scale: 0.48 },
  black_tea:       { file: 'models/tea_black.glb',       scale: 0.8 },
  mate:            { file: 'models/mate.glb',            scale: 0.9 },
  matcha:          { file: 'models/matcha.glb',          scale: 1.08 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3D — GLB preparation
// ─────────────────────────────────────────────────────────────────────────────
function processGLB(gltfScene, cfg) {
  const model = gltfScene.clone(true);

  model.traverse(child => {
    if (!child.isMesh) return;

    if (child.geometry) child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone());
    else if (child.material) child.material = child.material.clone();

    child.castShadow = true;
    child.receiveShadow = true;
  });

  const box    = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const size      = box.getSize(new THREE.Vector3());
  const maxDim    = Math.max(size.x, size.y, size.z);
  const autoScale = maxDim > 0 ? (1.6 / maxDim) : 1.0;
  
  const wrapper = new THREE.Group();
  wrapper.userData.baseScale = autoScale * (cfg.scale || 1.0);
  wrapper.userData.rotationYOffset = cfg.rotationY || 0;
  wrapper.add(model);

  return wrapper;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — GLB loader with cache
// ─────────────────────────────────────────────────────────────────────────────
function loadAndBuildGLB(drinkId) {
  return new Promise(resolve => {
    const cfg     = DRINK_3D[drinkId] || DRINK_3D.espresso;
    const fileUrl = cfg.file;

    if (glbCache[fileUrl]) {
      resolve(processGLB(glbCache[fileUrl], cfg));
      return;
    }

    gltfLoader.load(
      fileUrl,
      gltf => { glbCache[fileUrl] = gltf.scene; resolve(processGLB(gltf.scene, cfg)); },
      undefined,
      err  => { console.error('Error loading 3D model:', fileUrl, err); resolve(new THREE.Group()); }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — scene init
// ─────────────────────────────────────────────────────────────────────────────
function disposeModel(model) {
  if (!model) return;
  const disposedMaterials = new Set();

  model.traverse(child => {
    if (!child.isMesh) return;

    if (child.geometry) child.geometry.dispose();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => {
      if (!material || disposedMaterials.has(material)) return;
      if (material.dispose) material.dispose();
      disposedMaterials.add(material);
    });
  });
}

function init3D() {
  const container = els.canvasContainer;
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.01, 100);
  camera.position.set(0, 0.7, 3.8);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.insertBefore(renderer.domElement, container.firstChild);

  new RGBELoader().load(
    'hdri/comfy_cafe_1k.hdr', // Local path for faster loading
    hdrTexture => {
      const pmrem  = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envMap = pmrem.fromEquirectangular(hdrTexture).texture;
      scene.environment = envMap;
      hdrTexture.dispose();
      pmrem.dispose();
    }
  );

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const fill = new THREE.DirectionalLight(0xfff0e0, 1.0);
  fill.position.set(2, 4, 3);
  scene.add(fill);

  switch3DModel(state.selectedDrinkId);
  animate3D();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — swap model on drink change
// ─────────────────────────────────────────────────────────────────────────────
function disposeCarouselModels() {
  carouselModels.forEach(model => {
    scene.remove(model);
    disposeModel(model);
  });
  carouselModels = [];
  currentModelGroup = null;
}

function updateCarouselModelTransforms(t = Date.now() * 0.001) {
  const layout = getCarouselLayout();
  const bounceElapsed = modelBounceStart ? (Date.now() - modelBounceStart) / 1000 : 999;
  const bounceProgress = clamp(bounceElapsed / 1, 0, 1);
  const bounceAmount = bounceProgress < 1
    ? Math.sin(bounceProgress * Math.PI * 2.6) * (1 - bounceProgress) * 0.035
    : 0;
  carouselModels.forEach(model => {
    const offset    = (model.userData.carouselOffset || 0) + carouselDragProgress;
    const distance  = Math.min(Math.abs(offset), 1.4);
    const baseScale = model.userData.baseScale || 1.0;

    model.position.x = offset * layout.spacing;
    model.position.y = layout.yOffset + Math.sin(t * 1.1) * 0.04;
    model.position.z = -distance * 0.22;
    model.rotation.x = rotX;
    model.rotation.y = rotY + (model.userData.rotationYOffset || 0) - offset * 0.22;
    const activeBounce = Math.abs(offset) < 0.08 ? bounceAmount : 0;
    model.scale.setScalar(baseScale * layout.scaleMultiplier * (1 - distance * 0.13) * (1 + activeBounce));
    model.visible = Math.abs(offset) < 1.55;
  });
}

async function switch3DModel(drinkId) {
  if (!scene) return;
  const switchToken = ++modelSwitchToken;

  disposeCarouselModels();
  carouselDragProgress = 0;

  rotX = 0.35; rotY = 0; rotVelX = 0; rotVelY = 0;

  const orderedDrinks = getOrderedDrinks();
  const currentIndex  = Math.max(0, orderedDrinks.findIndex(d => d.id === drinkId));
  const carouselItems = [-1, 0, 1]
    .map(offset => ({ offset, drink: orderedDrinks[currentIndex + offset] }))
    .filter(item => item.drink);

  const loadedModels = await Promise.all(
    carouselItems.map(async item => {
      const model = await loadAndBuildGLB(item.drink.id);
      model.userData.carouselOffset = item.offset;
      model.userData.drinkId = item.drink.id;
      return model;
    })
  );

  if (switchToken !== modelSwitchToken) {
    loadedModels.forEach(disposeModel);
    return;
  }

  carouselModels = loadedModels;
  carouselModels.forEach(model => {
    scene.add(model);
    if (model.userData.carouselOffset === 0) currentModelGroup = model;
  });
  updateCarouselModelTransforms();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — render loop
// ─────────────────────────────────────────────────────────────────────────────
function animate3D() {
  requestAnimationFrame(animate3D);
  const t = Date.now() * 0.001;

  if (currentModelGroup) {
    if (!rotDragging) {
      rotVelX *= 0.90; rotVelY *= 0.90;
      rotY    += rotVelX * 0.002;
      rotX    += rotVelY * 0.002;
      rotX     = Math.max(-0.7, Math.min(0.7, rotX));
      
      // Slower rotation
      if (Math.abs(rotVelX) < 0.5) rotY += 0.002; 
    }
    updateCarouselModelTransforms(t);
  }

  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────
initUI();
init3D();

const resizeObserver = new ResizeObserver(() => {
  if (renderer && camera && els.canvasContainer.clientWidth > 0) {
    camera.aspect = els.canvasContainer.clientWidth / els.canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(els.canvasContainer.clientWidth, els.canvasContainer.clientHeight);
    updateCarouselModelTransforms();
  }
});
resizeObserver.observe(els.canvasContainer);

window.addEventListener('resize', () => {
  updateUI();
  fitDrinkName();
  updateCarouselModelTransforms();
});

document.fonts?.ready?.then(() => {
  fitDrinkName();
});
