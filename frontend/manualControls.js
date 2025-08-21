// manualControls.js - FIXED WEB VERSION
// Manual control buttons for testing animations and ball physics
// Fixed for web deployment without module imports

(function() {
  'use strict';
  
  let manualControlsInitialized = false;

  function log(...args) {
    console.log('[MANUAL]', ...args);
  }

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

    // Wire up manual controls
    wireUpControls();
    log('Manual controls created');
  }

  function wireUpControls() {
    document.getElementById('testPitch')?.addEventListener('click', () => {
      log('Testing pitch animation');
      document.dispatchEvent(new CustomEvent('gc:play', {
        detail: {
          type: 'PITCH',
          desc: 'Manual Test Pitch [0.1, 0.2]',
          raw: { pitch: { type: 'Fastball', mph: 95 } }
        }
      }));
    });

    document.getElementById('testSwing')?.addEventListener('click', () => {
      log('Testing swing animation');
      document.dispatchEvent(new CustomEvent('gc:play', {
        detail: {
          type: 'SWING',
          desc: 'Manual Test Swing',
          raw: {}
        }
      }));
    });

    document.getElementById('testContact')?.addEventListener('click', () => {
      log('Testing contact animation');
      document.dispatchEvent(new CustomEvent('gc:play', {
        detail: {
          type: 'CONTACT',
          desc: 'Manual Test Contact [0.0, 0.3]',
          raw: {}
        }
      }));
    });

    document.getElementById('testIdle')?.addEventListener('click', () => {
      log('Resetting to idle');
      document.dispatchEvent(new CustomEvent('gc:play', {
        detail: {
          type: 'IDLE',
          desc: 'Manual Reset to Idle',
          raw: {}
        }
      }));
    });

    document.getElementById('testBall')?.addEventListener('click', () => {
      log('Launching ball manually');
      const objects = findGameObjects();
      const ball = objects.ball;
      
      if (ball) {
        // Reset ball position
        if (window.gc.anchors?.rubber) {
          const rubberPos = new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.rubber.matrixWorld);
          ball.position.copy(rubberPos);
          ball.position.y += 1.5;
          log('Ball positioned at rubber');
        } else {
          ball.position.set(0, 1.5, -15);
        }
        
        ball.userData.v = new window.gc.THREE.Vector3(0, -0.01, 0.08);
        
        if (window.tracerClear) window.tracerClear();
        if (window.tracerPush) window.tracerPush(ball.position);
        
        log('Ball launched');
      } else {
        console.warn('No ball found!');
      }
    });

    document.getElementById('clearTrail')?.addEventListener('click', () => {
      log('Clearing ball trail');
      if (window.tracerClear) window.tracerClear();
      
      // Clear enhanced trails too
      if (window.gc?.enhanced?.ballPhysics) {
        window.gc.enhanced.ballPhysics.reset();
      }
      
      // Clear any other trails
      if (window.gc?.tracker) {
        window.gc.tracker.count = 0;
        window.gc.tracker.line.geometry.setDrawRange(0, 0);
        window.gc.tracker.line.geometry.attributes.position.needsUpdate = true;
      }
    });

    document.getElementById('findObjects')?.addEventListener('click', () => {
      const objects = findGameObjects();
      log('Object search results:', objects);
      
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
  }

  // Enhanced object finding
  function findGameObjects() {
    log('Searching for game objects...');
    
    // Check nodes
    if (window.gc?.nodes) {
      log('gc.nodes:', Object.keys(window.gc.nodes));
      Object.keys(window.gc.nodes).forEach(key => {
        const obj = window.gc.nodes[key];
        if (obj && obj.position) {
          log(`${key}:`, obj.position.toArray().map(n => n.toFixed(2)));
        }
      });
    }
    
    return {
      ball: window.gc?.nodes?.ball,
      bat: window.gc?.nodes?.bat,
      pitcher: window.gc?.nodes?.pitcher,
      batter: window.gc?.nodes?.batter,
      pitcherMesh: window.gc?.nodes?.pitcherMesh,
      batterMesh: window.gc?.nodes?.batterMesh
    };
  }

  // Enhanced debug function
  function debugGameState() {
    if (!window.gc) {
      log('GameCast not ready');
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
      enhanced: !!window.gc.enhanced
    };

    log('GameCast State:', state);

    // Check player positions
    if (window.gc.nodes?.pitcher) {
      const pos = window.gc.nodes.pitcher.position.toArray().map(n => n.toFixed(2));
      log('Pitcher position:', pos);
    }
    if (window.gc.nodes?.batter) {
      const pos = window.gc.nodes.batter.position.toArray().map(n => n.toFixed(2));
      const bbox = new window.gc.THREE.Box3().setFromObject(window.gc.nodes.batter);
      log('Batter position:', pos);
      log('Batter bbox min.y:', bbox.min.y.toFixed(3));
    }
    if (window.gc.nodes?.ball) {
      const pos = window.gc.nodes.ball.position.toArray().map(n => n.toFixed(2));
      log('Ball position:', pos);
      log('Ball velocity:', window.gc.nodes.ball.userData.v?.toArray?.()?.map(n => n.toFixed(3)) || 'none');
    }
    if (window.gc.nodes?.bat) {
      const pos = window.gc.nodes.bat.position.toArray().map(n => n.toFixed(2));
      const rot = window.gc.nodes.bat.rotation.toArray().slice(0,3).map(n => n.toFixed(3));
      log('Bat position:', pos);
      log('Bat rotation:', rot);
    }

    // Check clips
    Object.entries(window.gc.clips || {}).forEach(([key, clips]) => {
      log(`${key} clips:`, Object.keys(clips));
    });

    return state;
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
      <button id="testEnhanced" style="background:#1a4a4a;">Test Enhanced</button>
      <button id="resetSystems" style="background:#4a2a1a;">Reset Systems</button>
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
        log('Manual batter Y adjustment:', adjustment.toFixed(3));
      }
    });

    document.getElementById('testEnhanced')?.addEventListener('click', () => {
      if (window.gc?.enhanced?.ballPhysics) {
        log('Testing enhanced ball physics...');
        const testPitch = {
          pitchType: 'Fastball',
          velocity: 95,
          location: { x: 0.2, z: 2.5 },
          outcome: 'Strike'
        };
        
        if (window.gc.enhanced.gameState) {
          const pitch = window.gc.enhanced.gameState.processPitch(testPitch);
          window.gc.enhanced.ballPhysics.launchBall(
            pitch, 
            window.gc.nodes.ball, 
            window.gc.nodes.pitcher, 
            window.gc.nodes.pitcherMesh
          );
        }
      } else {
        log('Enhanced systems not available');
      }
    });

    document.getElementById('resetSystems')?.addEventListener('click', () => {
      log('Resetting all systems...');
      
      // Reset enhanced systems
      if (window.gc?.enhanced?.ballPhysics) {
        window.gc.enhanced.ballPhysics.reset();
      }
      if (window.gc?.enhanced?.gameState) {
        window.gc.enhanced.gameState.resetGame();
      }
      
      // Reset basic systems
      if (window.tracerClear) window.tracerClear();
      if (window.reset) window.reset();
      
      // Reset heat map
      if (window.heat) {
        window.heat.forEach(row => row.fill(0));
        if (window.drawZone) window.drawZone();
      }
      
      log('All systems reset');
    });
  }

  // Performance monitor
  function addPerformanceMonitor() {
    const perfDiv = document.createElement('div');
    perfDiv.id = 'performanceMonitor';
    perfDiv.style.cssText = `
      position: absolute; bottom: 10px; right: 10px;
      background: rgba(0,0,0,0.8); color: #00ff88;
      padding: 8px; border-radius: 5px; font-size: 11px;
      font-family: monospace; border: 1px solid rgba(0,255,136,0.3);
      z-index: 1000;
    `;
    document.body.appendChild(perfDiv);

    let frameCount = 0;
    let lastTime = performance.now();
    
    setInterval(() => {
      const now = performance.now();
      const fps = Math.round(frameCount * 1000 / (now - lastTime));
      frameCount = 0;
      lastTime = now;
      
      const memInfo = performance.memory ? 
        `Mem: ${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : 
        'Mem: N/A';
      
      const ballActive = window.gc?.nodes?.ball?.userData?.v ? 'Ball: Active' : 'Ball: Static';
      const enhancedActive = window.gc?.enhanced?.ballPhysics?.isActive?.() ? 'Enhanced: Active' : 'Enhanced: Static';
      
      perfDiv.innerHTML = `
        <div>FPS: ${fps}</div>
        <div>${memInfo}</div>
        <div>${ballActive}</div>
        <div>${enhancedActive}</div>
      `;
    }, 1000);
    
    // Count frames
    function countFrame() {
      frameCount++;
      requestAnimationFrame(countFrame);
    }
    countFrame();
  }

  // Initialize when GameCast is ready
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.gc.nodes) {
      log('GameCast detected, adding manual controls...');
      setTimeout(() => {
        createManualControls();
        addDebugButton();
        addPerformanceMonitor();
        
        // Add global access for debugging
        window.debugGameState = debugGameState;
        window.createManualControls = createManualControls;
      }, 1000);
    } else {
      setTimeout(waitForGameCast, 500);
    }
  }

  // Listen for GameCast ready event
  document.addEventListener('gc:ready', () => {
    setTimeout(waitForGameCast, 500);
  });

  // Also initialize on DOM ready as fallback
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForGameCast);
  } else {
    waitForGameCast();
  }

  log('Manual controls script loaded');

})();