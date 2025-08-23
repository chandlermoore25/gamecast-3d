// stream.client.js - FIXED VERSION

// --- Mode control: 'live' (StatsAPI) or 'db' (local replay) ---
let STREAM_MODE = 'live';
export function setStreamMode(mode){
  STREAM_MODE = (mode === 'db') ? 'db' : 'live';
  console.log('[STREAM] Mode set:', STREAM_MODE);
}
window.streamMode = { set: setStreamMode };

// Added local DB option and better error handling
const FETCH_TIMEOUT_MS = 12000; // increased timeout for slow cold starts


const DEFAULT_BACKENDS = [
  'http://localhost:8000',  // Local FastAPI
  'https://gamecast-3d.onrender.com'  // Render backup
];

let ws = null, es = null, connected = false, lastKey = null;

function log(...a){ console.log('[STREAM]', ...a); }

function inferType(ev){
  const out = (ev?.pitch?.outcome || '').toLowerCase();
  if (/hit by pitch|walk/.test(out)) return 'WALK';
  if (/strikeout|k looking|k swinging/.test(out)) return 'STRIKEOUT';
  if (/foul/.test(out)) return 'FOUL';
  if (/in play|single|double|triple|home run|homer/.test(out)) return 'INPLAY';
  return 'PITCH';
}

function asDesc(ev){
  const mph = ev?.pitch?.mph ? Math.round(ev.pitch.mph) : '—';
  const px = ev?.pitch?.loc?.px, pz = ev?.pitch?.loc?.pz;
  const hasLoc = (typeof px === 'number' && typeof pz === 'number');
  return `${ev?.pitch?.type || 'Pitch'} ${mph}${typeof mph==='number'?' mph':''} ${hasLoc ? `[${(+px).toFixed(2)},${(+pz).toFixed(2)}]` : ''}`.trim();
}

function dispatchPlay(ev){
  const type = inferType(ev);
  const desc = asDesc(ev);
  
  // Enhanced event with animation triggers
  const enhancedEvent = {
    type, 
    desc, 
    raw: ev,
    animation: {
      triggerPitcher: type === 'PITCH',
      triggerBatter: ['SWING', 'CONTACT', 'INPLAY'].includes(type),
      ballPhysics: {
        enabled: true,
        velocity: ev?.pitch?.mph || 95,
        location: {
          x: ev?.pitch?.loc?.px || (Math.random() - 0.5) * 1.6,
          z: ev?.pitch?.loc?.pz || 1.5 + Math.random() * 2
        }
      }
    }
  };
  
  document.dispatchEvent(new CustomEvent('gc:play', { detail: enhancedEvent }));
  log('▶', ev.idempotencyKey, type, desc);
}

function reduce(ev){
  if (!ev || !ev.idempotencyKey) return;
  if (lastKey && ev.idempotencyKey <= lastKey) {
    log('skip dup', ev.idempotencyKey);
    return;
  }
  lastKey = ev.idempotencyKey;
  dispatchPlay(ev);
  
  // Update HUD
  const hud = document.getElementById('gc_hud') || injectHud();
  hud.textContent = `Inning ${ev.half || '?'} ${ev.inning || '?'} | Outs ${ev.outs ?? '?'} | Count ${ev.count?.balls ?? '?'}-${ev.count?.strikes ?? '?'}\n` +
                    `Pitch ${ev.pitch?.type || '?'} @ ${ev.pitch?.mph ? Math.round(ev.pitch.mph) : '—'} mph | key=${ev.idempotencyKey}`;
}

function injectHud(){
  const el = document.createElement('pre');
  el.id = 'gc_hud';
  Object.assign(el.style, {
    position:'absolute', right:'10px', top:'10px', zIndex:20,
    background:'rgba(0,0,0,.55)', color:'#bfefff', padding:'8px 10px',
    border:'1px solid #0a3a4a', borderRadius:'10px', font:'12px/1.3 ui-monospace', maxWidth:'42ch'
  });
  document.body.appendChild(el);
  return el;
}

function injectControls(){
  const ui = document.getElementById('ui') || (()=> {
    const d=document.createElement('div'); d.id='ui'; document.body.appendChild(d); return d;
  })();
  
  // Remove existing controls if present
  const existing = document.querySelector('#streamControls');
  if (existing) existing.remove();
  
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.id = 'streamControls';
  wrap.innerHTML = `
    <select id="gc_backend" style="width:200px;padding:6px 8px;border-radius:8px;border:1px solid #123847;background:#06141a;color:#bfefff;">
      <option value="http://localhost:8000">Local DB (localhost:8000)</option>
      <option value="https://gamecast-3d.onrender.com">Render Backend</option>
    </select>
    <input id="gc_date" type="date" style="padding:6px 8px;border-radius:8px;border:1px solid #123847;background:#06141a;color:#bfefff;" />
    <button id="gc_load">Load Games</button>
    <select id="gc_games" style="min-width:220px;padding:6px 8px;border-radius:8px;border:1px solid #123847;background:#06141a;color:#bfefff;"></select>
    <button id="gc_connect">Connect</button>
    <button id="gc_disconnect" style="background:#5a1a1a;">Disconnect</button>
    <span id="gc_status" class="badge">Offline</span>
  `;
  ui.appendChild(wrap);

  // Set default date to today
  const dateInput = document.getElementById('gc_date');
  dateInput.value = new Date().toISOString().slice(0,10);

  // Load saved backend preference
  const savedBackend = localStorage.getItem('gc_backend') || DEFAULT_BACKENDS[0];
  document.getElementById('gc_backend').value = savedBackend;

  // Wire up controls
  document.getElementById('gc_load').onclick = loadGames;
  document.getElementById('gc_connect').onclick = connectToGame;
  document.getElementById('gc_disconnect').onclick = disconnect;
  
  // Auto-test connection on backend change
  document.getElementById('gc_backend').onchange = testConnection;
  
  // Test connection on startup
  setTimeout(testConnection, 1000);
}

async function testConnection() {
  const backendSelect = document.getElementById('gc_backend');
  const status = document.getElementById('gc_status');
  const backend = backendSelect.value;
  
  status.textContent = 'Testing...';
  status.style.background = '#4a4a1a';
  
  try {
    log('Testing connection to:', backend);
    const response = await fetch(`${getActiveBackend()}/api/games?date=2024-01-01`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      mode: 'cors',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      status.textContent = 'Available';
      status.style.background = '#1a5a3a';
      localStorage.setItem('gc_backend', backend);
      log('✅ Connection successful to:', backend);
      return true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    status.textContent = 'Error';
    status.style.background = '#5a1a1a';
    log('❌ Connection failed to:', backend, error.message);
    return false;
  }
}

async function loadGames() {
  const backend = document.getElementById('gc_backend').value;
  const date = document.getElementById('gc_date').value || new Date().toISOString().slice(0,10);
  const gamesSelect = document.getElementById('gc_games');
  const status = document.getElementById('gc_status');
  
  if (!backend) {
    alert('Please select a backend');
    return;
  }
  
  status.textContent = 'Loading...';
  gamesSelect.innerHTML = '<option value="">Loading games...</option>';
  
  try {
    const url = `${getActiveBackend()}/api/games?date=${date}&source=${STREAM_MODE}`;
    log('Ensuring backend for mode ${STREAM_MODE} ...');
  await ensureBackend(STREAM_MODE);
  console.log('[STREAM] Loading games from:', url);
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const games = await response.json();
    log('Loaded games:', games.length);
    
    gamesSelect.innerHTML = '<option value="">Select a game...</option>';
    
    if (games.length === 0) {
      gamesSelect.innerHTML = '<option value="">No games found for this date</option>';
      status.textContent = 'No Games';
      return;
    }
    
    games.forEach(game => {
      const option = document.createElement('option');
      option.value = game.gamePk;
      option.textContent = `${game.away} @ ${game.home} — ${game.status}`;
      gamesSelect.appendChild(option);
    });
    
    status.textContent = `${games.length} Games`;
    status.style.background = '#1a4a5a';
    
  } catch (error) {
    log('❌ Failed to load games:', error.message);
    gamesSelect.innerHTML = '<option value="">Failed to load games</option>';
    status.textContent = 'Load Failed';
    status.style.background = '#5a1a1a';
    alert(`Failed to load games: ${error.message}`);
  }
}

function connectToGame() {
  const backend = document.getElementById('gc_backend').value;
  const gamePk = document.getElementById('gc_games').value;
  
  if (!backend) {
    alert('Please select a backend');
    return;
  }
  
  if (!gamePk) {
    alert('Please select a game');
    return;
  }
  
  connectWS(backend, gamePk);
}

function connectWS(base, gamePk){
  cleanup();
  
  const status = document.getElementById('gc_status');
  status.textContent = 'Connecting...';
  status.style.background = '#4a4a1a';
  
  const wsUrl = `${base.replace(/^http/, 'ws')}/ws/game/${gamePk}`;
  log('WS connecting to:', wsUrl);
  
  ws = new WebSocket(wsUrl);
  let fellBack = false;
  
  ws.onopen = () => { 
    connected = true; 
    status.textContent = 'Connected (WS)';
    status.style.background = '#1a5a3a';
    log('✅ WebSocket connected'); 
  };
  
  ws.onmessage = (m) => { 
    try{ 
      reduce(JSON.parse(m.data)); 
    } catch(e) { 
      log('❌ Bad JSON:', e); 
    } 
  };
  
  ws.onerror = (e) => { 
    log('❌ WebSocket error:', e); 
    if (!fellBack) {
      fellBack = true;
      fallbackSSE(base, gamePk); 
    }
  };
  
  ws.onclose = () => { 
    connected = false;
    status.textContent = 'Disconnected';
    status.style.background = '#5a1a1a';
    if (!fellBack) {
      fellBack = true;
      fallbackSSE(base, gamePk); 
    }
  };
}

function fallbackSSE(base, gamePk){
  cleanup();
  
  const status = document.getElementById('gc_status');
  status.textContent = 'SSE Fallback...';
  status.style.background = '#4a4a1a';
  
  const url = `${base}/sse/stream?gamePk=${gamePk}&source=${STREAM_MODE}`;
  log('SSE fallback to:', url);
  
  es = new EventSource(url);
  
  es.onopen = () => {
    status.textContent = 'Connected (SSE)';
    status.style.background = '#1a5a3a';
    log('✅ SSE connected');
  };
  
  es.onmessage = (e) => { 
    try{ 
      reduce(JSON.parse(e.data)); 
    } catch(err) { 
      log('❌ SSE bad JSON:', err); 
    } 
  };
  
  es.addEventListener('end', () => { 
    log('SSE stream ended'); 
    es.close(); 
  });
  
  es.onerror = (e) => { 
    log('❌ SSE error:', e); 
    status.textContent = 'SSE Error';
    status.style.background = '#5a1a1a';
    es.close(); 
  };
}

function disconnect() {
  cleanup();
  const status = document.getElementById('gc_status');
  status.textContent = 'Offline';
  status.style.background = '#06141a';
  log('Disconnected');
}

function cleanup(){
  if (ws) { 
    try { ws.close(); } catch {} 
    ws = null; 
  }
  if (es) { 
    try { es.close(); } catch {} 
    es = null; 
  }
  connected = false; 
  lastKey = null;
}

// Initialize when DOM is ready
window.addEventListener('load', injectControls);

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Export for external use
window.streamClient = {
  connect: connectWS,
  disconnect,
  cleanup,
  isConnected: () => connected
};