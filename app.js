import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// --- CUSTOM SHADERS ---
import { espressoCupMaterial, applyEspressoShaders } from './shaders/espressoShader.js'; 
import { cappuccinoCupMaterial, createCappuccinoFoamMaterial } from './shaders/cappuccinoShader.js';

import { cupMaterial as americanoCup, liquidMaterial as americanoLiquid } from './shaders/americanoShader.js';
import { cupMaterial as filterCup, liquidMaterial as filterLiquid } from './shaders/filtered_coffeeShader.js';
import { glassMaterial as latteGlass, liquidMaterial as latteLiquid } from './shaders/latte_macchiatoShader.js';
import { cupMaterial as matchaCup } from './shaders/matcha_cupShader.js';
import { liquidMaterial as matchaLiquid } from './shaders/matcha_liquidShader.js';
import { cupMaterial as mateCup, strawMaterial as mateStraw, liquidMaterial as mateLiquid } from './shaders/mateShader.js';
import { glassMaterial as teaGlass, liquidMaterial as teaLiquid } from './shaders/tea_blackShader.js';
import { cafeCremaCupMaterial, applyCafeCremaShaders } from './shaders/cafe_cremaShader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Splash screen
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const splash       = document.getElementById('splash-screen');
  const homeScreen   = document.getElementById('home-screen');
  const splashLottie = document.getElementById('splash-lottie');
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
    setTimeout(hideSplash, 4000);
  } else {
    setTimeout(hideSplash, 2800);
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

let state = {
  selectedDrinkId:  initialDrink.id,
  selectedModifier: initialModifier,
  log:        JSON.parse(localStorage.getItem('caffeine-log'))   || [],
  profile:    localStorage.getItem('caffeine-profile')           || 'neutral',
  habit:      localStorage.getItem('caffeine-habit')             || 'unregular',
  drinkOrder: savedOrder,
};

let predictionFreezeTime = 0;
let deletedDrinkMemory   = null;
let undoTimeout          = null;
let profileToastTimeout  = null;
let scrubX               = null;
let prevBloodMg          = null;

function saveState() {
  localStorage.setItem('caffeine-log',     JSON.stringify(state.log));
  localStorage.setItem('caffeine-profile', state.profile);
  localStorage.setItem('caffeine-habit',   state.habit);
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
  modContainer:     document.getElementById('modifier-container'),
  modToggle:        document.getElementById('modifier-toggle'),
  addBtn:           document.getElementById('add-btn'),
  peakTime:         document.getElementById('peak-time'),
  halfLifeTime:     document.getElementById('halflife-time'),
  sleepTime:        document.getElementById('sleep-time'),
  bloodMg:          document.getElementById('current-blood-mg'),
  insightPeak:      document.getElementById('insight-peak-time'),
  insightHalf:      document.getElementById('insight-halflife-time'),
  insightSleep:     document.getElementById('insight-sleep-time'),
  cardPeak:         document.getElementById('card-peak'),
  cardHalf:         document.getElementById('card-halflife'),
  cardSleep:        document.getElementById('card-sleep'),
  insightPeakIcon:  document.getElementById('insight-peak-icon'),
  insightHalfIcon:  document.getElementById('insight-half-icon'),
  insightSleepIcon: document.getElementById('insight-sleep-icon'),
  phaseTag:         document.getElementById('current-phase-tag'),
  graphCanvas:      document.getElementById('caffeine-graph'),
  logList:          document.getElementById('log-list'),
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
  sortableList:     document.getElementById('sortable-drinks'),
  fabInsightsBtn:   document.getElementById('fab-insights-btn'),
  fabInsightsIcon:  document.getElementById('fab-insights-icon'),
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

function selectDrink(index) {
  const orderedDrinks    = getOrderedDrinks();
  const drink            = orderedDrinks[index];
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
    btn.textContent = variant.label.charAt(0);
    btn.onclick    = () => { state.selectedModifier = variant.modifier; triggerNumberAnimation(); updateUI(); };
    els.modToggle.appendChild(btn);
  });
}

let currentTab = 0;
const slider  = document.getElementById('screen-slider');
const screens = [document.getElementById('home-screen'), document.getElementById('insights-screen')];

function switchToTab(tabIndex) {
  currentTab = tabIndex;
  slider.style.transform = `translateX(-${tabIndex * 50}%)`;
  screens.forEach(s => s.classList.remove('animate-content'));
  const activeScreen = screens[tabIndex];
  void activeScreen.offsetWidth;
  activeScreen.classList.add('animate-content');

  // Toggle Header Buttons based on Tab
  if (tabIndex === 0) {
    els.fabInsightsBtn.style.display = 'flex';
    document.getElementById('header-settings-btn').style.display = 'none';
  } else {
    els.fabInsightsBtn.style.display = 'none';
    document.getElementById('header-settings-btn').style.display = 'flex';
  }
  setTimeout(updateUI, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings panel
// ─────────────────────────────────────────────────────────────────────────────
function initSettings() {
  els.settingsBtns.forEach(btn => {
    btn.onclick = () => {
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

  const showSettingsToast = () => {
    const h  = getHalfLifeMs() / (3600 * 1000);
    const mg = getSleepSafeThreshold();
    els.profileToastMsg.textContent = `Updated: Half-life ${h}h, Sleep Safe ${mg}mg`;
    els.profileToast.classList.add('visible');
    clearTimeout(profileToastTimeout);
    profileToastTimeout = setTimeout(() => els.profileToast.classList.remove('visible'), 3500);
  };

  els.profileSelector.addEventListener('change', e => { state.profile = e.target.value; saveState(); showSettingsToast(); });
  els.habitSelector.addEventListener('change',   e => { state.habit   = e.target.value; saveState(); showSettingsToast(); });

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

let activeLiquidMaterial = null;
let activeCupMaterial    = null;

let cappuccinoFoamTexture = null;
let bounceStartTime       = 0;

// ─────────────────────────────────────────────────────────────────────────────
// UI init
// ─────────────────────────────────────────────────────────────────────────────
function initUI() {
  renderCarouselDots();
  initSettings();

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
  const settingsIcon = document.getElementById('settings-btn-icon');

  ['icons/awake_word_mark_green.svg', 'icons/setting_icon_green.svg', 'icons/body_insights_icon.svg'].forEach(src => {
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
  setupImageSwap(settingsIcon, 'icons/setting_icon.svg',       'icons/setting_icon_green.svg');
  setupImageSwap(els.fabInsightsIcon, 'icons/body_insights_icon_green.svg', 'icons/body_insights_icon.svg');

  document.getElementById('logo-btn').addEventListener('click', () => switchToTab(0));
  els.fabInsightsBtn.addEventListener('click', () => switchToTab(1));

  let screenSwipeStartX = null;
  let screenSwipeStartY = null;
  const EDGE_THRESHOLD  = 50;

  document.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      screenSwipeStartX = e.touches[0].clientX;
      screenSwipeStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (screenSwipeStartX === null) return;
    const dx = e.changedTouches[0].clientX - screenSwipeStartX;
    const dy = e.changedTouches[0].clientY - screenSwipeStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (currentTab === 0 && screenSwipeStartX > window.innerWidth - EDGE_THRESHOLD && dx < 0) switchToTab(1);
      else if (currentTab === 1 && screenSwipeStartX < EDGE_THRESHOLD && dx > 0) switchToTab(0);
    }
    screenSwipeStartX = null;
    screenSwipeStartY = null;
  });

  let swipeStartX   = 0;
  let isPointerDown = false;
  const swipeThreshold = 70;
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
        interactionMode = 'rotate';
        bounceStartTime = Date.now(); // Trigger the spring bounce animation
      }
    }
    
    swipeStartX   = clientX;
    isPointerDown = true;
    rotLastX = clientX; rotLastY = clientY;
    rotDragging = interactionMode === 'rotate';
    rotVelX = 0; rotVelY = 0;
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!isPointerDown) return;
    if (interactionMode === 'carousel') {
      const dx = clientX - swipeStartX;
      if (Math.abs(dx) > swipeThreshold) {
        const orderedDrinks = getOrderedDrinks();
        const currentIndex  = orderedDrinks.findIndex(d => d.id === state.selectedDrinkId);
        if (dx < 0 && currentIndex < orderedDrinks.length - 1) { selectDrink(currentIndex + 1); swipeStartX = clientX; }
        else if (dx > 0 && currentIndex > 0)                   { selectDrink(currentIndex - 1); swipeStartX = clientX; }
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

  const handlePointerEnd = () => { isPointerDown = false; rotDragging = false; interactionMode = 'none'; };

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
    
    predictionFreezeTime = Date.now() + 1000;
    state.log.push({ id: Date.now(), name: logName, mg, time: Date.now() });
    saveState();
    
    els.addBtn.textContent = 'Added! ✓';
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

  function handleScrub(e) {
    const rect    = els.graphCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    scrubX        = Math.max(0, Math.min(clientX - rect.left, rect.width));
    updateUI();
  }
  els.graphCanvas.addEventListener('touchstart', handleScrub, { passive: true });
  els.graphCanvas.addEventListener('touchmove',  handleScrub, { passive: true });
  els.graphCanvas.addEventListener('mousedown',  handleScrub);
  els.graphCanvas.addEventListener('mousemove',  e => { if (e.buttons === 1) handleScrub(e); });
  const resetScrub = () => { scrubX = null; updateUI(); };
  els.graphCanvas.addEventListener('touchend',   resetScrub);
  els.graphCanvas.addEventListener('mouseup',    resetScrub);
  els.graphCanvas.addEventListener('mouseleave', resetScrub);

  updateUI();
  setInterval(updateUI, 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar Graph drawing
// ─────────────────────────────────────────────────────────────────────────────
function drawGraph(todayLogs, currentMg) {
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

  const now        = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0).getTime();
  const endOfDay   = startOfDay + (18 * 3600000);

  const numBars = 36;
  const points = [];
  for (let i = 0; i < numBars; i++) {
    const time = startOfDay + ((endOfDay - startOfDay) * (i / (numBars - 1)));
    points.push({ time, x: (i / (numBars - 1)) * width, y: getTotalDecayedCaffeine(todayLogs, time) });
  }

  const maxMg = Math.max(100, ...points.map(p => p.y)) * 1.2;
  const barWidth = (width / numBars) * 0.7; 

  const currentTime = Date.now();

  points.forEach(p => {
    const barHeight = (p.y / maxMg) * height;
    if (barHeight < 1) return; 

    const xPos = p.x - (barWidth / 2);
    const yPos = height - barHeight;

    ctx.fillStyle = (p.time > currentTime) ? 'rgba(200, 200, 200, 0.4)' : 'rgba(160, 160, 160, 0.9)'; 

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(xPos, yPos, barWidth, barHeight, [3, 3, 0, 0]);
    else ctx.rect(xPos, yPos, barWidth, barHeight);
    ctx.fill();
  });

  if (scrubX !== null) {
    const timeAtScrub = startOfDay + (scrubX / width) * (endOfDay - startOfDay);
    const mgAtScrub   = getTotalDecayedCaffeine(todayLogs, timeAtScrub);
    const scrubY      = height - ((mgAtScrub / maxMg) * height);

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(scrubX, 0); ctx.lineTo(scrubX, height);
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)'; ctx.lineWidth = 1.5;
    ctx.stroke(); ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(scrubX, scrubY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#888888'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font      = '12px inherit';
    const text      = `${Math.round(mgAtScrub)} mg`;
    const textWidth = ctx.measureText(text).width;
    const textX     = (scrubX + 8 + textWidth > width) ? scrubX - 8 - textWidth : scrubX + 8;
    ctx.fillText(text, textX, Math.max(12, scrubY - 8));
  } else {
    if (currentTime >= startOfDay && currentTime <= endOfDay) {
      const currentX = ((currentTime - startOfDay) / (endOfDay - startOfDay)) * width;
      const currentY = height - ((currentMg / maxMg) * height);
      ctx.beginPath();
      ctx.arc(currentX, currentY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#000000'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main UI update
// ─────────────────────────────────────────────────────────────────────────────
function updateUI() {
  const orderedDrinks = getOrderedDrinks();
  const drink         = orderedDrinks.find(d => d.id === state.selectedDrinkId) || orderedDrinks[0];
  const currentMg     = getCurrentSelectionMg();
  const todayLogs     = state.log.filter(e => new Date(e.time).toDateString() === new Date().toDateString());
  const physio        = calculateCurrentCaffeine();

  Array.from(els.dots.children).forEach((dot, i) => {
    dot.classList.toggle('active', orderedDrinks[i] && orderedDrinks[i].id === drink.id);
  });

  renderModifierToggle(drink);
  els.name.textContent = drink.name;
  els.mg.textContent   = currentMg;

  if (Date.now() > predictionFreezeTime) {
    const predictions            = getFixedPredictions(currentMg);
    els.peakTime.textContent     = formatTime(predictions.peak);
    els.halfLifeTime.textContent = formatTime(predictions.halfLife);
    els.sleepTime.textContent    = formatTime(predictions.sleepSafe);
  }

  if (prevBloodMg !== null && prevBloodMg !== physio.current) {
    els.bloodMg.classList.add('flash-green');
    setTimeout(() => els.bloodMg.classList.remove('flash-green'), 500);
  }
  prevBloodMg = physio.current;
  els.bloodMg.textContent = `${physio.current}`;

  const currentStats           = getFixedPredictions(0);
  els.insightPeak.textContent  = formatTime(currentStats.peak);
  els.insightHalf.textContent  = formatTime(currentStats.halfLife);
  els.insightSleep.textContent = formatTime(currentStats.sleepSafe);

  const phase             = getPhase(physio.current, todayLogs);
  els.phaseTag.textContent = phase.label;
  els.phaseTag.className  = `phase-tag ${phase.class}`;

  els.cardPeak.classList.remove('active-phase');
  els.cardHalf.classList.remove('active-phase');
  els.cardSleep.classList.remove('active-phase');
  
  if      (phase.id === 'ascending') els.cardPeak.classList.add('active-phase');
  else if (phase.id === 'declining') els.cardHalf.classList.add('active-phase');
  else                               els.cardSleep.classList.add('active-phase');

  if (els.insightPeakIcon)  els.insightPeakIcon.src  = (phase.id === 'ascending') ? 'icons/flash_icon_green.svg' : 'icons/flash_icon.svg';
  if (els.insightHalfIcon)  els.insightHalfIcon.src  = (phase.id === 'declining') ? 'icons/clock_icon_green.svg' : 'icons/clock_icon.svg';
  if (els.insightSleepIcon) els.insightSleepIcon.src = (phase.id !== 'ascending' && phase.id !== 'declining') ? 'icons/moon_icon_green.svg' : 'icons/moon_icon.svg';

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

  drawGraph(todayLogs, physio.current);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — model catalogue
// ─────────────────────────────────────────────────────────────────────────────
const glbCache   = {};
const gltfLoader = new GLTFLoader();

const DRINK_3D = {
  espresso:        { file: 'models/espresso.glb',        scale: 0.8 },
  americano:       { file: 'models/americano.glb',       scale: 1.0 },
  cappuccino:      { file: 'models/cappuccino.glb',      scale: 0.9 },
  latte_macchiato: { file: 'models/latte_macchiato.glb', scale: 0.9 },
  cafe_crema:      { file: 'models/cafe_crema.glb',      scale: 1.0 },
  filter:          { file: 'models/filtered_coffee.glb', scale: 0.9 },
  green_tea:       { file: 'models/tea_green.glb',       scale: 0.8 },
  black_tea:       { file: 'models/tea_black.glb',       scale: 0.8 },
  mate:            { file: 'models/mate.glb',            scale: 0.9 },
  matcha:          { file: 'models/matcha.glb',          scale: 0.9 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3D — material assignment per drink
// ─────────────────────────────────────────────────────────────────────────────
function processGLB(gltfScene, cfg, drinkId) {
  const model = gltfScene.clone(true);

  // Helper function to easily apply exported materials to mesh names
  const applyMaterials = (node, nameFilterMatMap) => {
    if (!node.isMesh) return;
    const name = node.name.toLowerCase();
    for (const [filter, mat] of Object.entries(nameFilterMatMap)) {
      if (name.includes(filter)) {
        node.material = mat;
        if (filter.includes('liquid') || filter.includes('foam')) activeLiquidMaterial = mat;
        if (filter.includes('cup') || filter.includes('glass')) activeCupMaterial = mat;
        return;
      }
    }
    // Fallback material
    node.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.0, roughness: 0.15,
      clearcoat: 1.0, clearcoatRoughness: 0.05,
    });
  };

  if (drinkId === 'espresso') {
    const { liquidMat } = applyEspressoShaders(model); 
    activeLiquidMaterial = liquidMat; 
    activeCupMaterial = espressoCupMaterial; 
  } 
  else if (drinkId === 'cappuccino') {
    const foamMat = cappuccinoFoamTexture ? createCappuccinoFoamMaterial(cappuccinoFoamTexture) : new THREE.MeshStandardMaterial({ color: 0xc68e58 });
    model.traverse(child => {
      if (!child.isMesh) return;
      const name = child.name.toLowerCase();
      if (name.includes('liquid')) {
        activeLiquidMaterial = foamMat; child.material = foamMat; child.castShadow = false; child.receiveShadow = false;
      } else if (name.includes('cup')) {
        activeCupMaterial = cappuccinoCupMaterial; child.material = cappuccinoCupMaterial; child.castShadow = true; child.receiveShadow = true;
      }
    });
  } 
  else if (drinkId === 'americano') {
    model.traverse(child => applyMaterials(child, { 'liquid': americanoLiquid, 'cup': americanoCup }));
  } 
  else if (drinkId === 'filter') {
    model.traverse(child => applyMaterials(child, { 'liquid': filterLiquid, 'cup': filterCup }));
  } 
  else if (drinkId === 'latte_macchiato') {
    model.traverse(child => applyMaterials(child, { 'liquid': latteLiquid, 'glass': latteGlass, 'cup': latteGlass }));
  } 
  else if (drinkId === 'matcha') {
    model.traverse(child => applyMaterials(child, { 'liquid': matchaLiquid, 'cup': matchaCup }));
  } 
  else if (drinkId === 'mate') {
    model.traverse(child => applyMaterials(child, { 'liquid': mateLiquid, 'straw': mateStraw, 'bombilla': mateStraw, 'cup': mateCup }));
  } 
  else if (drinkId === 'black_tea' || drinkId === 'green_tea') {
    model.traverse(child => applyMaterials(child, { 'liquid': teaLiquid, 'cup': teaGlass, 'glass': teaGlass }));
  } 
 else if (drinkId === 'cafe_crema') {
    const { liquidMat } = applyCafeCremaShaders(model); 
    activeLiquidMaterial = liquidMat; 
    activeCupMaterial = cafeCremaCupMaterial; 
  }
  else {
    model.traverse(child => applyMaterials(child, {}));
  }

  const box    = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const size      = box.getSize(new THREE.Vector3());
  const maxDim    = Math.max(size.x, size.y, size.z);
  const autoScale = maxDim > 0 ? (1.6 / maxDim) : 1.0;
  
  // Save original scale for the bounce interaction to reference
  model.userData.baseScale = autoScale * (cfg.scale || 1.0);
  model.scale.setScalar(model.userData.baseScale);

  return model;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — GLB loader with cache
// ─────────────────────────────────────────────────────────────────────────────
function loadAndBuildGLB(drinkId) {
  return new Promise(resolve => {
    const cfg     = DRINK_3D[drinkId] || DRINK_3D.espresso;
    const fileUrl = cfg.file;

    if (glbCache[fileUrl]) {
      resolve(processGLB(glbCache[fileUrl], cfg, drinkId));
      return;
    }

    gltfLoader.load(
      fileUrl,
      gltf => { glbCache[fileUrl] = gltf.scene; resolve(processGLB(gltf.scene, cfg, drinkId)); },
      undefined,
      err  => { console.error('Error loading 3D model:', fileUrl, err); resolve(new THREE.Group()); }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — scene init
// ─────────────────────────────────────────────────────────────────────────────
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

  new THREE.TextureLoader().load(
    'shader_images/cappuccino_foam.png',
    tex => { cappuccinoFoamTexture = tex; },
    undefined,
    err => console.error('cappuccino_foam.png failed to load:', err)
  );

  switch3DModel(state.selectedDrinkId);
  animate3D();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — swap model on drink change
// ─────────────────────────────────────────────────────────────────────────────
async function switch3DModel(drinkId) {
  if (!scene) return;

  if (currentModelGroup) {
    currentModelGroup.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (child.material.map) child.material.map.dispose();
        
        const isShared = child.material === cappuccinoCupMaterial
                      || child.material === espressoCupMaterial; 
                      
        if (!isShared && child.material.dispose) child.material.dispose();
      }
    });
    scene.remove(currentModelGroup);
  }

  currentModelGroup    = null;
  activeLiquidMaterial = null;
  activeCupMaterial    = null;

  rotX = 0.35; rotY = 0; rotVelX = 0; rotVelY = 0;

  const model       = await loadAndBuildGLB(drinkId);
  currentModelGroup = model;
  scene.add(currentModelGroup);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D — render loop
// ─────────────────────────────────────────────────────────────────────────────
function animate3D() {
  requestAnimationFrame(animate3D);
  const t = Date.now() * 0.001;

  if (activeLiquidMaterial?.uniforms?.uTime) {
    activeLiquidMaterial.uniforms.uTime.value = t;
  }
  if (activeCupMaterial?.uniforms?.uTime) {
    activeCupMaterial.uniforms.uTime.value = t;
  }

  if (activeLiquidMaterial?.uniforms?.uCameraPos) {
    activeLiquidMaterial.uniforms.uCameraPos.value.copy(camera.position);
  }
  if (activeCupMaterial?.uniforms?.uCameraPos) {
    activeCupMaterial.uniforms.uCameraPos.value.copy(camera.position);
  }

  if (currentModelGroup) {
    if (!rotDragging) {
      rotVelX *= 0.90; rotVelY *= 0.90;
      rotY    += rotVelX * 0.002;
      rotX    += rotVelY * 0.002;
      rotX     = Math.max(-0.7, Math.min(0.7, rotX));
      currentModelGroup.position.y = -0.40 + Math.sin(t * 1.1) * 0.04;
      
      // Slower rotation
      if (Math.abs(rotVelX) < 0.5) rotY += 0.002; 
    }
    currentModelGroup.rotation.x = rotX;
    currentModelGroup.rotation.y = rotY;

    // Handling tactile spring bounce animation
    let scaleMultiplier = 1.0;
    if (bounceStartTime) {
      const elapsed = Date.now() - bounceStartTime;
      const duration = 300; // Fast short duration
      if (elapsed < duration) {
        const progress = elapsed / duration;
        // Quicker, lighter spring formula
        scaleMultiplier = 1.0 - Math.exp(-progress * 8) * Math.cos(progress * 25) * 0.08;
      } else {
        bounceStartTime = 0; // End animation
      }
    }
    
    // Apply combined scale
    const baseScale = currentModelGroup.userData.baseScale || 1.0;
    currentModelGroup.scale.setScalar(baseScale * scaleMultiplier);
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
  }
});
resizeObserver.observe(els.canvasContainer);

window.addEventListener('resize', updateUI);