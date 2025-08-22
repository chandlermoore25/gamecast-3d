// [MobileV3] main.mjs — Welcome flow + Mode selection + Engine/Orchestrator/Timeline wiring
console.debug('[MobileV3] main.mjs loaded');

import { Orchestrator } from './orchestrator.mjs';
import { Timeline, tick as timelineTick } from './timeline.mjs';
import './ui.scoreboard.mjs'; // mounts scoreboard HUD once engine is ready

// Feature flags (readable by existing scripts)
window.gc = window.gc || {};
window.gc.flags = Object.assign({ mobile: true, debug: false }, window.gc.flags || {});

// ---------- DOM ----------
const welcome = document.getElementById('welcomeOverlay');
const mode = document.getElementById('modeOverlay');
const serverEl = document.getElementById('server');
const dateEl = document.getElementById('gdate');
const gameEl = document.getElementById('game');
const fetchBtn = document.getElementById('btnFetch');
const nextBtn = document.getElementById('btnNext');
const backBtn = document.getElementById('btnBack');
const startBtn = document.getElementById('btnStart');
const btnLive = document.getElementById('btnLive');
const btnDemo = document.getElementById('btnDemo');
const btnRewind = document.getElementById('btnRewind');
const debugBtn = document.getElementById('btnDebug');
const debugPanel = document.getElementById('debugPanel');
const toastEl = document.getElementById('toast');
const statusEl = document.getElementById('welcomeStatus');

// ---------- Local state ----------
const state = {
  server: localStorage.getItem('gc.server') || 'http://localhost:8000',
  date: localStorage.getItem('gc.date') || new Date().toISOString().slice(0, 10),
  gamePk: null,
  mode: null,       // 'live' | 'rewind' | 'demo'
  rewindStart: null // marker string
};

serverEl.value = state.server;
dateEl.value = state.date;

// ---------- Helpers ----------
function toast(msg) {
  console.debug('[MobileV3][toast]', msg);
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.style.display = 'none'), 1800);
}

async function fetchGames() {
  const url = `${state.server}/api/games?date=${encodeURIComponent(state.date)}`;
  statusEl.textContent = 'Fetching games…';
  console.debug('[MobileV3] fetchGames', url);
  try {
    const r = await fetch(url, { mode: 'cors' });
    const list = await r.json();
    console.debug('[MobileV3] games', list);
    gameEl.innerHTML = '<option value="">— select a game —</option>';
    for (const g of list) {
      const opt = document.createElement('option');
      opt.value = g.gamePk;
      opt.textContent = `${g.away} @ ${g.home} — ${g.status}`;
      gameEl.appendChild(opt);
    }
    statusEl.textContent = `Found ${list.length} games for ${state.date}`;
  } catch (e) {
    console.warn('[MobileV3] fetchGames error', e);
    statusEl.textContent = 'Failed to fetch games. Check server URL.';
    toast('Can’t reach server');
  }
}

/**
 * Load the existing engine with robust fallbacks.
 * Tries several paths so it works whether you serve /frontend/ or repo root.
 */
async function loadEngine() {
  const base = new URL('.', import.meta.url); // .../frontend/mobile/
  const candidates = [
    new URL('../app.module.local.js', base).href,      // /frontend/app.module.local.js
    new URL('../../app.module.local.js', base).href,   // repo root app.module.local.js (if served /frontend/mobile/)
    '/frontend/app.module.local.js',                   // absolute path under /frontend
    '/app.module.local.js'                             // absolute at repo root
  ];
  for (const href of candidates) {
    try {
      console.debug('[MobileV3] trying engine at', href);
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(/* @vite-ignore */ href);
      console.debug('[MobileV3] loaded engine from', href, mod);
      return mod;
    } catch (e) {
      console.warn('[MobileV3] engine not at', href, e?.message || e);
    }
  }
  throw new Error(
    'app.module.local.js not found. Place it at /frontend/app.module.local.js (recommended), ' +
    'or /app.module.local.js, or adjust paths in mobile/main.mjs.'
  );
}

// ---------- Wire up UI ----------
fetchBtn.onclick = () => {
  state.server = serverEl.value.trim();
  state.date = dateEl.value;
  localStorage.setItem('gc.server', state.server);
  localStorage.setItem('gc.date', state.date);
  fetchGames();
};

gameEl.onchange = () => {
  state.gamePk = gameEl.value ? Number(gameEl.value) : null;
  nextBtn.disabled = !state.gamePk;
};

nextBtn.onclick = () => {
  welcome.style.display = 'none';
  mode.style.display = 'flex';
};

backBtn.onclick = () => {
  mode.style.display = 'none';
  welcome.style.display = 'flex';
};

btnLive.onclick = () => {
  state.mode = 'live';
  toast('Live selected');
};

btnDemo.onclick = () => {
  state.mode = 'demo';
  toast('Demo selected');
};

btnRewind.onclick = () => {
  state.mode = 'rewind';
  const marker = prompt('Start from? (e.g., inning=7,half=top,pitch=1). Leave blank to start from beginning.');
  state.rewindStart = marker || null;
  toast('Re-wind selected');
};

// ---------- Start flow ----------
startBtn.onclick = start;

async function start() {
  if (!state.gamePk && state.mode !== 'demo') {
    toast('Pick a game');
    return;
  }
  console.debug('[MobileV3] start', JSON.stringify(state));

  // Boot engine once
  await loadEngine();

  // Start timeline tick alongside engine RAF
  (function loop() {
    requestAnimationFrame(loop);
    try {
      timelineTick(performance.now());
    } catch (e) {
      console.warn('[Timeline.tick]', e);
    }
  })();

  const orch = new Orchestrator({ server: state.server, gamePk: state.gamePk });
  window.gc.orch = orch;

  if (state.mode === 'demo') {
    welcome.style.display = 'none';
    mode.style.display = 'none';
    window.gc.flags.debug = true;
    const demo = await import('./presets.demo.mjs');
    demo.runOneInning();
    return;
  }

  if (state.mode === 'live') {
    welcome.style.display = 'none';
    mode.style.display = 'none';
    await orch.connectLive();
    return;
  }

  if (state.mode === 'rewind') {
    welcome.style.display = 'none';
    mode.style.display = 'none';
    await orch.playReplay(state.rewindStart);
    return;
  }
}

// ---------- Debug drawer ----------
debugBtn.addEventListener('click', () => {
  const v = debugPanel.style.display === 'block';
  debugPanel.style.display = v ? 'none' : 'block';
  if (!v) mountDebug();
});

function mountDebug() {
  const show = window.gc.flags.debug || localStorage.getItem('GC_DEBUG') === '1';
  if (!show) {
    debugPanel.innerHTML = '<div class="tiny">Debug disabled</div>';
    return;
  }
  const el = debugPanel;
  el.innerHTML = '';

  const mk = (t, fn) => {
    const b = document.createElement('button');
    b.textContent = t;
    b.className = 'btn';
    b.style.margin = '4px';
    b.onclick = fn;
    return b;
  };

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '6px';

  row.appendChild(mk('Test Pitch', () => dispatch('pitch-released', { mph: 95, type: 'FF' })));
  row.appendChild(mk('Test Swing', () => dispatch('swing-start', {})));
  row.appendChild(mk('Test Contact', () => dispatch('contact', { inPlay: true, ev: 102, la: 25, spray: 10 })));
  row.appendChild(mk('Reset', () => window.reset?.()));

  el.appendChild(row);
}

function dispatch(type, data) {
  document.dispatchEvent(new CustomEvent('gc:play', { detail: { type, data } }));
}

// Optional autoboot of games list:
// if (localStorage.getItem('GC_AUTOFETCH') === '1') setTimeout(() => fetchGames(), 200);
