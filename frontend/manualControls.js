// manualControls.js
// Manual control buttons for testing animations and ball physics
// FIXED: Removed duplicate function declarations

let manualControlsInitialized = false;

function createManualControls() {
  if (manualControlsInitialized) return;
  manualControlsInitialized = true;

  const ui = document.getElementById('ui');
  if (!ui) return;

  // Remove existing manual controls if they exist
  const existing = document.getElementById('manualControls');
  if (existing) existing.remove();

  const controlsRow = document.createElement('div');
  controlsRow.className = 'row';
  controlsRow.id = 'manualControls';
  controlsRow.innerHTML = `
    <span class="badge">Manual Controls:</span>
    <button id="testPitch">Test Pitch</button>
    <button id="testSwing">Test Swing</button>
    <button id="testContact">Test Contact</button>
    <button id="testIdle">Reset to Idle</button>
    <button id="testBall">Launch Ball</button>
    <button id="clearTrail">Clear Trail</button>
    <button id="findObjects">Find Objects</button>
  `;
  
  ui.appendChild(controlsRow);

  // Enhanced object finding
  function findGameObjects() {
    console.log('[FIND] Searching for game objects...');
    
    // Check nodes
    if (window.gc?.nodes) {
      console.log('[FIND] gc.nodes:', Object.keys(window.gc.nodes));
      Object.keys(window.gc.nodes).forEach(key => {
        const obj = window.gc.nodes[key];
        if (obj && obj.position) {
          console.log(`[FIND] ${key}:`, obj.position.toArray().map(n => n.toFixed(2)));
        }
      });
    }
    
    return {
      ball: window.gc?.nodes?.ball,
      bat: window.gc?.nodes?.bat,
      pitcher: window.gc?.nodes?.pitcher,
      batter: window.gc?.nodes?.batter
    };
  }

  // Wire up manual controls
  document.getElementById('testPitch')?.addEventListener('click', () => {
    console.log('[MANUAL] Testing pitch animation');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'PITCH',
        desc: 'Manual Test Pitch [0.1, 0.2]',
        raw: { pitch: { type: 'Fastball', mph: 95 } }
      }
    }));
  });

  document.getElementById('testSwing')?.addEventListener('click', () => {
    console.log('[MANUAL] Testing swing animation');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'SWING',
        desc: 'Manual Test Swing',
        raw: {}
      }
    }));
  });

  document.getElementById('testContact')?.addEventListener('click', () => {
    console.log('[MANUAL] Testing contact animation');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'CONTACT',
        desc: 'Manual Test Contact [0.0, 0.3]',
        raw: {}
      }
    }));
  });

  document.getElementById('testIdle')?.addEventListener('click', () => {
    console.log('[MANUAL] Resetting to idle');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'IDLE',
        desc: 'Manual Reset to Idle',
        raw: {}
      }
    }));
  });

  document.getElementById('testBall')?.addEventListener('click', () => {
    console.log('[MANUAL] Launching ball manually');
    const objects = findGameObjects();
    const ball = objects.ball;
    
    if (ball) {
      // Reset ball position
      if (window.gc.anchors?.rubber) {
        const rubberPos = new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.rubber.matrixWorld);
        ball.position.copy(rubberPos);
        ball.position.y += 1.5;
        console.log('[MANUAL] Ball positioned at rubber');
      } else {
        ball.position.set(0, 1.5, -15);
      }
      
      ball.userData.v = new window.gc.THREE.Vector3(0, -0.01, 0.08);
      
      if (window.tracerClear) window.tracerClear();
      if (window.tracerPush) window.tracerPush(ball.position);
      
      console.log('[MANUAL] Ball launched');
    } else {
      console.warn('[MANUAL] No ball found!');
    }
  });

  document.getElementById('clearTrail')?.addEventListener('click', () => {
    console.log('[MANUAL] Clearing ball trail');
    if (window.tracerClear) window.tracerClear();
  });

  document.getElementById('findObjects')?.addEventListener('click', () => {
    const objects = findGameObjects();
    console.log('[MANUAL] Object search results:', objects);
    
    const results = Object.entries(objects).map(([key, obj]) => 
      `${key}: ${obj ? '✓' : '✗'}`
    ).join(' | ');
    
    const btn = document.getElementById('findObjects');
    const originalText = btn.textContent;
    btn.textContent = results;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 3000);
  });

  console.log('[MANUAL] Manual controls created');
}

// Enhanced debug function
function debugGameState() {
  if (!window.gc) {
    console.log('[DEBUG] GameCast not ready');
    return;
  }

  console.log('[DEBUG] GameCast State:', {
    scene: !!window.gc.scene,
    nodes: Object.keys(window.gc.nodes || {}),
    ball: !!window.gc.nodes?.ball,
    bat: !!window.gc.nodes?.bat
  });

  if (window.gc.nodes?.batter) {
    const pos = window.gc.nodes.batter.position.toArray().map(n => n.toFixed(2));
    const scale = window.gc.nodes.batter.scale.toArray().map(n => n.toFixed(3));
    console.log('[DEBUG] Batter position:', pos, 'scale:', scale);
  }
  if (window.gc.nodes?.pitcher) {
    const pos = window.gc.nodes.pitcher.position.toArray().map(n => n.toFixed(2));
    const scale = window.gc.nodes.pitcher.scale.toArray().map(n => n.toFixed(3));
    console.log('[DEBUG] Pitcher position:', pos, 'scale:', scale);
  }
}

// Add debug button
function addDebugButton() {
  const ui = document.getElementById('ui');
  if (!ui) return;

  // Remove existing debug row
  const existingDebug = document.getElementById('debugControls');
  if (existingDebug) existingDebug.remove();

  const debugRow = document.createElement('div');
  debugRow.className = 'row';
  debugRow.id = 'debugControls';
  debugRow.innerHTML = `
    <button id="debugState" style="background:#4a4a1a;">Debug State</button>
    <button id="fixBatter" style="background:#4a1a4a;">Fix Batter Y</button>
    <button id="stopResnap" style="background:#4a2a1a;">Stop Auto-Resnap</button>
  `;
  
  ui.appendChild(debugRow);

  document.getElementById('debugState')?.addEventListener('click', debugGameState);
  
  document.getElementById('fixBatter')?.addEventListener('click', () => {
    if (window.gc?.nodes?.batter) {
      const batter = window.gc.nodes.batter;
      const bbox = new window.gc.THREE.Box3().setFromObject(batter);
      const adjustment = -bbox.min.y;
      batter.position.y += adjustment;
      batter.updateMatrixWorld(true);
      console.log('[DEBUG] Manual batter Y adjustment:', adjustment.toFixed(3));
    }
  });

  document.getElementById('stopResnap')?.addEventListener('click', () => {
    // Stop the continuous resnapping
    if (window.gc?.autoResnap) {
      clearInterval(window.gc.autoResnap);
      window.gc.autoResnap = null;
      console.log('[DEBUG] Stopped auto-resnap');
    }
    
    // Disable the resnap function temporarily
    if (window.gc?.resnap) {
      window.gc.resnapDisabled = true;
      console.log('[DEBUG] Disabled resnap function');
    }
  });
}

// Initialize only once when GameCast is ready
document.addEventListener('gc:ready', () => {
  setTimeout(() => {
    createManualControls();
    addDebugButton();
    
    // Add global access for debugging
    window.debugGameState = debugGameState;
    window.createManualControls = createManualControls;
  }, 1000);
});

  document.getElementById('testBall')?.addEventListener('click', () => {
    console.log('[MANUAL] Launching ball manually');
    const objects = findGameObjects();
    const ball = objects.ball;
    
    if (ball) {
      console.log('[MANUAL] Ball found, launching...');
      
      // Reset ball position to pitcher area
      if (window.gc.anchors?.rubber) {
        const rubberPos = new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.rubber.matrixWorld);
        ball.position.copy(rubberPos);
        ball.position.y += 1.5; // Shoulder height
        console.log('[MANUAL] Ball positioned at rubber:', ball.position.toArray().map(n => n.toFixed(2)));
      } else {
        ball.position.set(0, 1.5, -15); // Fallback position
        console.log('[MANUAL] Ball positioned at fallback location');
      }
      
      // Give it velocity toward plate
      ball.userData.v = new window.gc.THREE.Vector3(0, -0.01, 0.08);
      console.log('[MANUAL] Ball velocity set:', ball.userData.v.toArray());
      
      // Clear and start trail
      if (window.tracerClear) {
        window.tracerClear();
        console.log('[MANUAL] Trail cleared');
      }
      
      // Add to trail
      if (window.tracerPush) {
        window.tracerPush(ball.position);
        console.log('[MANUAL] Ball added to trail');
      }
    } else {
      console.warn('[MANUAL] No ball found! Checking primitives...');
      // Force primitives check
      setTimeout(() => {
        const newObjects = findGameObjects();
        if (newObjects.ball) {
          console.log('[MANUAL] Ball found after delay, retrying...');
          document.getElementById('testBall').click();
        } else {
          console.error('[MANUAL] Still no ball found. Check primitives.js loading.');
        }
      }, 1000);
    }
  });

  document.getElementById('clearTrail')?.addEventListener('click', () => {
    console.log('[MANUAL] Clearing ball trail');
    if (window.tracerClear) {
      window.tracerClear();
    }
    if (window.gc?.tracker) {
      window.gc.tracker.count = 0;
      window.gc.tracker.line.geometry.setDrawRange(0, 0);
      window.gc.tracker.line.geometry.attributes.position.needsUpdate = true;
    }
    if (window.gc?.ballTrail) {
      window.gc.ballTrail.pointCount = 0;
      window.gc.ballTrail.line.geometry.setDrawRange(0, 0);
      window.gc.ballTrail.line.geometry.attributes.position.needsUpdate = true;
    }
    console.log('[MANUAL] All trails cleared');
  });

  document.getElementById('findObjects')?.addEventListener('click', () => {
    const objects = findGameObjects();
    console.log('[MANUAL] Object search results:', objects);
    
    // Show results in UI
    const results = Object.entries(objects).map(([key, obj]) => 
      `${key}: ${obj ? '✓' : '✗'}`
    ).join(' | ');
    
    // Temporarily show results in button text
    const btn = document.getElementById('findObjects');
    const originalText = btn.textContent;
    btn.textContent = results;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 3000);
  });

  console.log('[MANUAL] Manual controls created');


// Enhanced debug function
function debugGameState() {
  if (!window.gc) {
    console.log('[DEBUG] GameCast not ready');
    return;
  }

  const state = {
    scene: !!window.gc.scene,
    nodes: Object.keys(window.gc.nodes || {}),
    anchors: Object.keys(window.gc.anchors || {}).filter(k => !!window.gc.anchors[k]),
    mixers: Object.keys(window.gc.mixers || {}),
    clips: Object.keys(window.gc.clips || {}),
    ball: !!window.gc.nodes?.ball,
    bat: !!window.gc.nodes?.bat,
    tracker: !!window.gc.tracker,
    ballTrail: !!window.gc.ballTrail
  };

  console.log('[DEBUG] GameCast State:', state);

  // Check player positions
  if (window.gc.nodes?.pitcher) {
    const pos = window.gc.nodes.pitcher.position.toArray().map(n => n.toFixed(2));
    console.log('[DEBUG] Pitcher position:', pos);
  }
  if (window.gc.nodes?.batter) {
    const pos = window.gc.nodes.batter.position.toArray().map(n => n.toFixed(2));
    const bbox = new window.gc.THREE.Box3().setFromObject(window.gc.nodes.batter);
    console.log('[DEBUG] Batter position:', pos);
    console.log('[DEBUG] Batter bbox min.y:', bbox.min.y.toFixed(3));
  }
  if (window.gc.nodes?.ball) {
    const pos = window.gc.nodes.ball.position.toArray().map(n => n.toFixed(2));
    console.log('[DEBUG] Ball position:', pos);
    console.log('[DEBUG] Ball velocity:', window.gc.nodes.ball.userData.v?.toArray?.()?.map(n => n.toFixed(3)) || 'none');
  }
  if (window.gc.nodes?.bat) {
    const pos = window.gc.nodes.bat.position.toArray().map(n => n.toFixed(2));
    const rot = window.gc.nodes.bat.rotation.toArray().slice(0,3).map(n => n.toFixed(3));
    console.log('[DEBUG] Bat position:', pos);
    console.log('[DEBUG] Bat rotation:', rot);
  }

  // Check clips
  Object.entries(window.gc.clips || {}).forEach(([key, clips]) => {
    console.log(`[DEBUG] ${key} clips:`, Object.keys(clips));
  });

  return state;
}

// Add debug button
function addDebugButton() {
  const ui = document.getElementById('ui');
  if (!ui) return;

  const debugRow = document.createElement('div');
  debugRow.className = 'row';
  debugRow.innerHTML = `
    <button id="debugState" style="background:#4a4a1a;">Debug State</button>
    <button id="fixBatter" style="background:#4a1a4a;">Fix Batter Y</button>
    <button id="toggleBallPhysics" style="background:#1a4a4a;">Toggle Ball Physics</button>
    <button id="forceResnap" style="background:#4a2a1a;">Force Resnap</button>
  `;
  
  ui.appendChild(debugRow);

  document.getElementById('debugState')?.addEventListener('click', debugGameState);
  
  document.getElementById('fixBatter')?.addEventListener('click', () => {
    if (window.gc?.nodes?.batter) {
      const batter = window.gc.nodes.batter;
      const bbox = new window.gc.THREE.Box3().setFromObject(batter);
      const adjustment = -bbox.min.y;
      batter.position.y += adjustment;
      batter.updateMatrixWorld(true);
      console.log('[DEBUG] Manual batter Y adjustment:', adjustment.toFixed(3));
      console.log('[DEBUG] New batter position:', batter.position.toArray().map(n => n.toFixed(2)));
    }
  });

  document.getElementById('toggleBallPhysics')?.addEventListener('click', () => {
    if (window.gc?.nodes?.ball) {
      const ball = window.gc.nodes.ball;
      if (ball.userData.v) {
        ball.userData.v = null;
        console.log('[DEBUG] Ball physics disabled');
      } else {
        ball.userData.v = new window.gc.THREE.Vector3(0, 0, 0.05);
        console.log('[DEBUG] Ball physics enabled');
      }
    }
  });

  document.getElementById('forceResnap')?.addEventListener('click', () => {
    if (window.gc?.resnap) {
      console.log('[DEBUG] Force resnapping players...');
      window.gc.resnap();
    } else {
      console.warn('[DEBUG] No resnap function available');
    }
  });
}

// Initialize when GameCast is ready
document.addEventListener('gc:ready', () => {
  setTimeout(() => {
    createManualControls();
    addDebugButton();
    
    // Add global access for debugging
    window.debugGameState = debugGameState;
    window.createManualControls = createManualControls;
  }, 1000);
});

// Also initialize on DOM ready as fallback
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.gc) {
        createManualControls();
        addDebugButton();
      }
    }, 2000);
  });
} else {
  setTimeout(() => {
    if (window.gc) {
      createManualControls();
      addDebugButton();
    }
  }, 2000);
}// manualControls.js
// Manual control buttons for testing animations and ball physics

function createManualControls() {
  const ui = document.getElementById('ui');
  if (!ui) return;

  // Remove existing manual controls if they exist
  const existing = document.getElementById('manualControls');
  if (existing) existing.remove();

  const controlsRow = document.createElement('div');
  controlsRow.className = 'row';
  controlsRow.id = 'manualControls';
  controlsRow.innerHTML = `
    <span class="badge">Manual Controls:</span>
    <button id="testPitch">Test Pitch</button>
    <button id="testSwing">Test Swing</button>
    <button id="testContact">Test Contact</button>
    <button id="testIdle">Reset to Idle</button>
    <button id="testBall">Launch Ball</button>
    <button id="clearTrail">Clear Trail</button>
  `;
  
  ui.appendChild(controlsRow);

  // Wire up manual controls
  document.getElementById('testPitch')?.addEventListener('click', () => {
    console.log('[MANUAL] Testing pitch animation');
    if (window.gc && window.gc.nodes) {
      // Trigger pitch event
      document.dispatchEvent(new CustomEvent('gc:play', {
        detail: {
          type: 'PITCH',
          desc: 'Manual Test Pitch [0.1, 0.2]',
          raw: {
            pitch: { type: 'Fastball', mph: 95 },
            count: { balls: 1, strikes: 1 }
          }
        }
      }));
    }
  });

  document.getElementById('testSwing')?.addEventListener('click', () => {
    console.log('[MANUAL] Testing swing animation');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'SWING',
        desc: 'Manual Test Swing',
        raw: { count: { balls: 1, strikes: 2 } }
      }
    }));
  });

  document.getElementById('testContact')?.addEventListener('click', () => {
    console.log('[MANUAL] Testing contact animation');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'CONTACT',
        desc: 'Manual Test Contact [0.0, 0.3]',
        raw: { count: { balls: 0, strikes: 0 } }
      }
    }));
  });

  document.getElementById('testIdle')?.addEventListener('click', () => {
    console.log('[MANUAL] Resetting to idle');
    document.dispatchEvent(new CustomEvent('gc:play', {
      detail: {
        type: 'IDLE',
        desc: 'Manual Reset to Idle',
        raw: {}
      }
    }));
  });

  document.getElementById('testBall')?.addEventListener('click', () => {
    console.log('[MANUAL] Launching ball manually');
    if (window.gc?.nodes?.ball) {
      const ball = window.gc.nodes.ball;
      
      // Reset ball position to pitcher area
      if (window.gc.anchors?.rubber) {
        const rubberPos = new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.rubber.matrixWorld);
        ball.position.copy(rubberPos);
        ball.position.y += 1.5; // Shoulder height
      } else {
        ball.position.set(0, 1.5, -15); // Fallback position
      }
      
      // Give it velocity toward plate
      ball.userData.v = new window.gc.THREE.Vector3(0, -0.01, 0.08);
      
      // Clear and start trail
      if (window.gc.tracker) {
        window.gc.tracker.count = 0;
        window.gc.tracker.line.geometry.setDrawRange(0, 0);
      }
      
      // Add to trail
      if (window.tracerPush) {
        window.tracerPush(ball.position);
      }
    }
  });

  document.getElementById('clearTrail')?.addEventListener('click', () => {
    console.log('[MANUAL] Clearing ball trail');
    if (window.gc?.tracker) {
      window.gc.tracker.count = 0;
      window.gc.tracker.line.geometry.setDrawRange(0, 0);
      window.gc.tracker.line.geometry.attributes.position.needsUpdate = true;
    }
    if (window.gc?.ballTrail) {
      window.gc.ballTrail.pointCount = 0;
      window.gc.ballTrail.line.geometry.setDrawRange(0, 0);
      window.gc.ballTrail.line.geometry.attributes.position.needsUpdate = true;
    }
  });

  console.log('[MANUAL] Manual controls created');
}

// Debug function to check current state
function debugGameState() {
  if (!window.gc) {
    console.log('[DEBUG] GameCast not ready');
    return;
  }

  console.log('[DEBUG] GameCast State:', {
    scene: !!window.gc.scene,
    nodes: Object.keys(window.gc.nodes || {}),
    anchors: Object.keys(window.gc.anchors || {}).filter(k => !!window.gc.anchors[k]),
    mixers: Object.keys(window.gc.mixers || {}),
    clips: Object.keys(window.gc.clips || {}),
    ball: !!window.gc.nodes?.ball,
    bat: !!window.gc.nodes?.bat,
    tracker: !!window.gc.tracker,
    ballTrail: !!window.gc.ballTrail
  });

  // Check player positions
  if (window.gc.nodes?.pitcher) {
    console.log('[DEBUG] Pitcher position:', window.gc.nodes.pitcher.position.toArray().map(n => n.toFixed(2)));
  }
  if (window.gc.nodes?.batter) {
    console.log('[DEBUG] Batter position:', window.gc.nodes.batter.position.toArray().map(n => n.toFixed(2)));
  }
  if (window.gc.nodes?.ball) {
    console.log('[DEBUG] Ball position:', window.gc.nodes.ball.position.toArray().map(n => n.toFixed(2)));
  }
}

// Add debug button
function addDebugButton() {
  const ui = document.getElementById('ui');
  if (!ui) return;

  const debugRow = document.createElement('div');
  debugRow.className = 'row';
  debugRow.innerHTML = `
    <button id="debugState" style="background:#4a4a1a;">Debug State</button>
    <button id="fixBatter" style="background:#4a1a4a;">Fix Batter Y</button>
    <button id="toggleBallPhysics" style="background:#1a4a4a;">Toggle Ball Physics</button>
  `;
  
  ui.appendChild(debugRow);

  document.getElementById('debugState')?.addEventListener('click', debugGameState);
  
  document.getElementById('fixBatter')?.addEventListener('click', () => {
    if (window.gc?.nodes?.batter) {
      const batter = window.gc.nodes.batter;
      const bbox = new window.gc.THREE.Box3().setFromObject(batter);
      const adjustment = -bbox.min.y;
      batter.position.y += adjustment;
      console.log('[DEBUG] Manual batter Y adjustment:', adjustment.toFixed(3));
      console.log('[DEBUG] New batter position:', batter.position.toArray().map(n => n.toFixed(2)));
    }
  });

  document.getElementById('toggleBallPhysics')?.addEventListener('click', () => {
    if (window.gc?.nodes?.ball) {
      const ball = window.gc.nodes.ball;
      if (ball.userData.v) {
        ball.userData.v = null;
        console.log('[DEBUG] Ball physics disabled');
      } else {
        ball.userData.v = new window.gc.THREE.Vector3(0, 0, 0.05);
        console.log('[DEBUG] Ball physics enabled');
      }
    }
  });
}

// Initialize when GameCast is ready
document.addEventListener('gc:ready', () => {
  setTimeout(() => {
    createManualControls();
    addDebugButton();
    
    // Add global access for debugging
    window.debugGameState = debugGameState;
    window.createManualControls = createManualControls;
  }, 1000);
});

// Also initialize on DOM ready as fallback
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.gc) {
        createManualControls();
        addDebugButton();
      }
    }, 2000);
  });
} else {
  setTimeout(() => {
    if (window.gc) {
      createManualControls();
      addDebugButton();
    }
  }, 2000);
}