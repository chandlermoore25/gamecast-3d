// simpleBackendToggle.js
// Simple toggle to enable/disable backend features without errors
// FIXED: Better game state integration and animation control

let backendEnabled = false;
let mockDataInterval = null;
let gameState = {
  inning: 1,
  half: 'top',
  outs: 0,
  balls: 0,
  strikes: 0,
  atBat: true
};

function log(...args) {
  console.log('[BACKEND]', ...args);
}

function updateGameState(eventData) {
  if (eventData.raw) {
    const raw = eventData.raw;
    gameState.inning = raw.inning || gameState.inning;
    gameState.half = raw.half || gameState.half;
    gameState.outs = raw.outs ?? gameState.outs;
    gameState.balls = raw.count?.balls ?? gameState.balls;
    gameState.strikes = raw.count?.strikes ?? gameState.strikes;
    
    // Update UI
    const gameStateEl = document.getElementById('gameState');
    if (gameStateEl) {
      gameStateEl.textContent = `${gameState.half} ${gameState.inning} · ${gameState.outs} Out · ${gameState.balls}-${gameState.strikes}`;
    }
  }
}

function createSimpleControls() {
  const ui = document.getElementById('ui');
  if (!ui) return;

  // Remove existing backend controls if they exist
  const existingRow = document.querySelector('#backendControls');
  if (existingRow) existingRow.remove();

  const backendRow = document.createElement('div');
  backendRow.className = 'row';
  backendRow.id = 'backendControls';
  backendRow.innerHTML = `
    <button id="toggleBackend" style="padding:6px 10px;background:#0a1f28;border:1px solid #123847;color:#bfefff;border-radius:8px;cursor:pointer;">Enable Live Data</button>
    <button id="mockData" style="padding:6px 10px;background:#0a1f28;border:1px solid #123847;color:#bfefff;border-radius:8px;cursor:pointer;">Mock Data</button>
    <span id="backendStatus" class="badge">Offline Mode</span>
  `;
  
  ui.appendChild(backendRow);

  // Wire up simple controls
  document.getElementById('toggleBackend').addEventListener('click', toggleBackend);
  document.getElementById('mockData').addEventListener('click', toggleMockData);
}

function toggleBackend() {
  const btn = document.getElementById('toggleBackend');
  const status = document.getElementById('backendStatus');
  
  if (!backendEnabled) {
    // Try to enable backend
    log('Attempting to connect to backend...');
    btn.textContent = 'Connecting...';
    btn.disabled = true;
    
    // Simple test connection
    testBackendConnection()
      .then(() => {
        backendEnabled = true;
        btn.textContent = 'Disable Live Data';
        btn.disabled = false;
        status.textContent = 'Live Data Active';
        status.style.background = '#1a5a3a';
        loadRealBackendControls();
      })
      .catch((error) => {
        log('Backend connection failed:', error.message);
        btn.textContent = 'Enable Live Data';
        btn.disabled = false;
        status.textContent = 'Connection Failed';
        status.style.background = '#5a1a1a';
        alert('Could not connect to live data backend.\nUsing offline mode instead.');
      });
  } else {
    // Disable backend
    backendEnabled = false;
    btn.textContent = 'Enable Live Data';
    status.textContent = 'Offline Mode';
    status.style.background = '#06141a';
    removeRealBackendControls();
  }
}

async function testBackendConnection() {
  const testUrls = [
    'https://gamecast-3d.onrender.com',
    'http://localhost:8000'
  ];
  
  for (const url of testUrls) {
    try {
      log(`Testing connection to ${url}...`);
      const response = await fetch(`${url}/api/games?date=2024-01-01`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        timeout: 5000
      });
      
      if (response.ok) {
        log(`Successfully connected to ${url}`);
        localStorage.setItem('gc_backend_url', url);
        return url;
      }
    } catch (error) {
      log(`Failed to connect to ${url}:`, error.message);
    }
  }
  
  throw new Error('No backend servers are accessible');
}

function loadRealBackendControls() {
  const ui = document.getElementById('ui');
  const backendUrl = localStorage.getItem('gc_backend_url') || 'https://gamecast-3d.onrender.com';
  
  // Remove simple controls
  const simpleRow = document.getElementById('backendControls');
  if (simpleRow) simpleRow.remove();
  
  // Add real backend controls
  const realRow = document.createElement('div');
  realRow.className = 'row';
  realRow.id = 'realBackendControls';
  realRow.innerHTML = `
    <input id="api" type="text" value="${backendUrl}" style="width:170px;padding:6px 8px;border-radius:8px;border:1px solid #123847;background:#06141a;color:#bfefff;" />
    <input id="date" type="date" value="${new Date().toISOString().slice(0,10)}" style="padding:6px 8px;border-radius:8px;border:1px solid #123847;background:#06141a;color:#bfefff;" />
    <button id="load">Load Games</button>
    <select id="games" style="min-width:260px;padding:6px 8px;border-radius:8px;border:1px solid #123847;background:#06141a;color:#bfefff;"><option value="">Select a game...</option></select>
    <button id="connect">Connect</button>
    <button id="disconnectBackend" style="background:#5a1a1a;">Disable</button>
  `;
  
  ui.appendChild(realRow);
  
  // Initialize real backend functionality
  if (window.initializeStreamClient) {
    window.initializeStreamClient();
  }
  
  // Add disconnect handler
  document.getElementById('disconnectBackend').addEventListener('click', () => {
    backendEnabled = false;
    removeRealBackendControls();
    createSimpleControls();
  });
}

function removeRealBackendControls() {
  const realRow = document.getElementById('realBackendControls');
  if (realRow) realRow.remove();
  
  // Cleanup any existing connections
  if (window.cleanupStreamConnections) {
    window.cleanupStreamConnections();
  }
}

function toggleMockData() {
  const btn = document.getElementById('mockData');
  const status = document.getElementById('backendStatus');
  
  if (!mockDataInterval) {
    // Start mock data
    mockDataInterval = setInterval(generateMockEvent, 3000);
    btn.textContent = 'Stop Mock Data';
    status.textContent = 'Mock Data Active';
    status.style.background = '#4a4a1a';
    log('Started mock data generation');
  } else {
    // Stop mock data
    clearInterval(mockDataInterval);
    mockDataInterval = null;
    btn.textContent = 'Mock Data';
    status.textContent = 'Offline Mode';
    status.style.background = '#06141a';
    log('Stopped mock data generation');
  }
}

function generateMockEvent() {
  const events = [
    { type: 'PITCH', desc: 'Fastball 94 mph [0.1, 0.3]' },
    { type: 'SWING', desc: 'Swing and miss [-0.2, 0.1]' },
    { type: 'CONTACT', desc: 'Line drive [0.0, 0.2]' },
    { type: 'FOUL', desc: 'Foul ball [-0.5, 0.8]' },
    { type: 'WALK', desc: 'Ball four' },
    { type: 'STRIKEOUT', desc: 'Strikeout swinging' }
  ];
  
  const randomEvent = events[Math.floor(Math.random() * events.length)];
  
  // Create realistic game progression
  if (randomEvent.type === 'STRIKEOUT' || randomEvent.type === 'WALK') {
    // Reset count and advance
    gameState.balls = 0;
    gameState.strikes = 0;
    gameState.outs = Math.min(2, gameState.outs + 1);
    if (gameState.outs >= 3) {
      gameState.outs = 0;
      gameState.half = gameState.half === 'top' ? 'bottom' : 'top';
      if (gameState.half === 'top') gameState.inning++;
    }
  } else if (randomEvent.type === 'CONTACT') {
    // Reset count for contact
    gameState.balls = 0;
    gameState.strikes = 0;
  } else if (randomEvent.type === 'FOUL') {
    // Foul ball - add strike if less than 2
    if (gameState.strikes < 2) gameState.strikes++;
  } else if (randomEvent.type === 'PITCH') {
    // Random ball or strike
    if (Math.random() < 0.6) {
      gameState.strikes = Math.min(2, gameState.strikes + 1);
    } else {
      gameState.balls = Math.min(3, gameState.balls + 1);
    }
  }
  
  const eventDetail = {
    type: randomEvent.type,
    desc: randomEvent.desc,
    raw: {
      event: 'pitch',
      gamePk: 999999,
      inning: gameState.inning,
      half: gameState.half,
      outs: gameState.outs,
      count: {
        balls: gameState.balls,
        strikes: gameState.strikes
      },
      pitch: {
        type: 'Fastball',
        mph: 90 + Math.random() * 10,
        loc: {
          px: (Math.random() - 0.5) * 2,
          pz: (Math.random() - 0.5) * 2
        }
      }
    }
  };
  
  document.dispatchEvent(new CustomEvent('gc:play', { detail: eventDetail }));
  updateGameState(eventDetail);
  
  log('Generated mock event:', randomEvent.type, `Count: ${gameState.balls}-${gameState.strikes}`);
}

// Initialize simple controls when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSimpleControls);
} else {
  createSimpleControls();
}

// Export functions for external use
window.toggleGameBackend = toggleBackend;
window.generateMockEvent = generateMockEvent;