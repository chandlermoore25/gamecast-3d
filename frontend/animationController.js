// animationController.js - FIXED VERSION
// Handles pitcher/batter animations with proper triggering

(function() {
  'use strict';
  
  console.log('[AnimationController] Loading fixed animation system...');
  
  let isInitialized = false;
  let currentAnimations = {
    pitcher: null,
    batter: null
  };
  
  function log(...args) {
    console.log('[ANIM]', ...args);
  }
  
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.gc.nodes && window.gc.mixers) {
      log('GameCast detected, initializing animations...');
      setTimeout(initializeAnimations, 1000);
    } else {
      setTimeout(waitForGameCast, 200);
    }
  }
  
  function initializeAnimations() {
    if (isInitialized) return;
    
    try {
      log('Available mixers:', Object.keys(window.gc.mixers));
      log('Available clips:', Object.keys(window.gc.clips));
      
      // Check what animations are available
      checkAvailableAnimations();
      
      // Hook into game events
      document.addEventListener('gc:play', handleAnimationEvent);
      
      // Override or create the play function
      window.play = createPlayFunction();
      
      // Create animation controls
      createAnimationControls();
      
      isInitialized = true;
      log('✅ Animation system initialized');
      
    } catch (error) {
      console.error('[AnimationController] ❌ Failed to initialize:', error);
    }
  }
  
  function checkAvailableAnimations() {
    const available = {
      pitcher: {
        mixer: !!window.gc.mixers.pitcher,
        clips: Object.keys(window.gc.clips.pitcherGLB || {})
      },
      batter: {
        mixer: !!window.gc.mixers.batter,
        clips: Object.keys(window.gc.clips.batterGLB || {})
      }
    };
    
    log('Available animations:', available);
    
    // Test animations if available
    if (available.pitcher.mixer && available.pitcher.clips.length > 0) {
      log('✅ Pitcher animations ready:', available.pitcher.clips);
    } else {
      log('❌ Pitcher animations not available');
    }
    
    if (available.batter.mixer && available.batter.clips.length > 0) {
      log('✅ Batter animations ready:', available.batter.clips);
    } else {
      log('❌ Batter animations not available');
    }
    
    return available;
  }
  
  function createPlayFunction() {
    return function(actionKey, eventData) {
      log('Playing action:', actionKey, eventData?.animation);
      
      try {
        // Handle pitcher animations
        if (shouldAnimatePitcher(actionKey, eventData)) {
          animatePitcher(actionKey, eventData);
        }
        
        // Handle batter animations with timing
        if (shouldAnimateBatter(actionKey, eventData)) {
          // Delay batter animation for realistic timing
          const delay = getBatterAnimationDelay(actionKey);
          setTimeout(() => {
            animateBatter(actionKey, eventData);
          }, delay);
        }
        
        // Handle ball physics
        if (eventData?.animation?.ballPhysics?.enabled) {
          launchBallWithPhysics(eventData.animation.ballPhysics);
        }
        
      } catch (error) {
        console.error('[ANIM] Error in play function:', error);
      }
    };
  }
  
  function shouldAnimatePitcher(actionKey, eventData) {
    return (actionKey === 'pitch' || eventData?.animation?.triggerPitcher) &&
           window.gc.mixers.pitcher && 
           window.gc.clips.pitcherGLB;
  }
  
  function shouldAnimateBatter(actionKey, eventData) {
    return (['swing', 'contact', 'foul'].includes(actionKey) || eventData?.animation?.triggerBatter) &&
           window.gc.mixers.batter && 
           window.gc.clips.batterGLB;
  }
  
  function getBatterAnimationDelay(actionKey) {
    // Realistic timing - batter swings after pitch motion starts
    switch (actionKey) {
      case 'swing': return 800;
      case 'contact': return 900;
      case 'foul': return 850;
      default: return 800;
    }
  }
  
  function animatePitcher(actionKey, eventData) {
    const mixer = window.gc.mixers.pitcher;
    const clips = window.gc.clips.pitcherGLB;
    
    if (!mixer || !clips) {
      log('❌ Pitcher animation unavailable');
      return;
    }
    
    // Stop current animation
    mixer.stopAllAction();
    
    // Find appropriate clip
    const clipName = findBestClip(clips, ['throw', 'pitch', 'throwing', 'windup']);
    const clip = clips[clipName];
    
    if (!clip) {
      log('❌ No pitcher clip found');
      return;
    }
    
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(window.gc.THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();
    
    currentAnimations.pitcher = action;
    
    log('✅ Pitcher animation started:', clipName);
    
    // Auto-return to idle after animation
    setTimeout(() => {
      if (action.isRunning()) {
        action.fadeOut(0.5);
      }
    }, action.getClip().duration * 1000);
  }
  
  function animateBatter(actionKey, eventData) {
    const mixer = window.gc.mixers.batter;
    const clips = window.gc.clips.batterGLB;
    
    if (!mixer || !clips) {
      log('❌ Batter animation unavailable');
      return;
    }
    
    // Stop current animation
    mixer.stopAllAction();
    
    // Find appropriate clip
    const clipName = findBestClip(clips, ['swing', 'hit', 'batting', 'strike']);
    const clip = clips[clipName];
    
    if (!clip) {
      log('❌ No batter clip found');
      return;
    }
    
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(window.gc.THREE.LoopOnce);
    action.clampWhenFinished = true;
    action.play();
    
    currentAnimations.batter = action;
    
    log('✅ Batter animation started:', clipName);
    
    // Auto-return to idle after animation
    setTimeout(() => {
      if (action.isRunning()) {
        action.fadeOut(0.5);
      }
    }, action.getClip().duration * 1000);
  }
  
  function findBestClip(clips, keywords) {
    const clipNames = Object.keys(clips);
    
    // Try to find clip by keyword match
    for (const keyword of keywords) {
      const found = clipNames.find(name => 
        name.toLowerCase().includes(keyword.toLowerCase())
      );
      if (found) return found;
    }
    
    // Return first available clip as fallback
    return clipNames[0];
  }
  
  function launchBallWithPhysics(ballPhysics) {
    const ball = window.gc.nodes.ball;
    if (!ball) {
      log('❌ No ball found for physics');
      return;
    }
    
    log('🚀 Launching ball with physics:', ballPhysics);
    
    // Use enhanced ball physics if available
    if (window.gc.enhanced?.ballPhysics) {
      window.gc.enhanced.ballPhysics.launchFromHand(
        ballPhysics.location, 
        ballPhysics.velocity
      );
    } else {
      // Fallback to basic ball physics
      launchBasicBall(ballPhysics);
    }
  }
  
  function launchBasicBall(ballPhysics) {
    const ball = window.gc.nodes.ball;
    const pitcher = window.gc.nodes.pitcher;
    
    if (!ball || !pitcher) return;
    
    // Position ball at pitcher
    ball.position.copy(pitcher.position);
    ball.position.y += 1.8; // Shoulder height
    ball.position.x += 0.3; // Hand offset
    
    // Calculate velocity toward plate
    const platePos = window.gc.anchors?.plate ? 
      new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
      new window.gc.THREE.Vector3(0, 0, 0);
    
    const direction = platePos.clone().sub(ball.position).normalize();
    const speed = (ballPhysics.velocity / 95) * 0.08;
    
    ball.userData.v = direction.multiplyScalar(speed);
    ball.userData.v.y += 0.02; // Add arc
    
    // Clear and start trail
    if (window.tracerClear) window.tracerClear();
    if (window.tracerPush) window.tracerPush(ball.position);
    
    log('⚾ Basic ball launched');
  }
  
  function handleAnimationEvent(event) {
    const { type, desc, animation } = event.detail;
    
    log('Handling event:', type, desc);
    
    // Map event types to actions
    const actionKey = mapEventToAction(type);
    
    if (actionKey && window.play) {
      window.play(actionKey, event.detail);
    }
  }
  
  function mapEventToAction(eventType) {
    const actionMap = {
      'PITCH': 'pitch',
      'STRIKE': 'pitch',
      'SWING': 'swing',
      'FOUL': 'foul',
      'CONTACT': 'contact',
      'INPLAY': 'contact',
      'WALK': 'pitch',
      'STRIKEOUT': 'swing'
    };
    
    return actionMap[eventType] || null;
  }
  
  function createAnimationControls() {
    const ui = document.getElementById('ui');
    if (!ui) return;
    
    // Remove existing animation controls
    const existing = document.getElementById('animationControls');
    if (existing) existing.remove();
    
    const controlsRow = document.createElement('div');
    controlsRow.className = 'row';
    controlsRow.id = 'animationControls';
    controlsRow.innerHTML = `
      <span class="badge">Animations:</span>
      <button id="testPitcherAnim">Test Pitcher</button>
      <button id="testBatterAnim">Test Batter</button>
      <button id="testFullSequence">Full Sequence</button>
      <button id="stopAllAnims">Stop All</button>
    `;
    
    ui.appendChild(controlsRow);
    
    // Wire up controls
    document.getElementById('testPitcherAnim')?.addEventListener('click', () => {
      window.play('pitch', { animation: { triggerPitcher: true } });
    });
    
    document.getElementById('testBatterAnim')?.addEventListener('click', () => {
      window.play('swing', { animation: { triggerBatter: true } });
    });
    
    document.getElementById('testFullSequence')?.addEventListener('click', () => {
      testFullSequence();
    });
    
    document.getElementById('stopAllAnims')?.addEventListener('click', () => {
      stopAllAnimations();
    });
    
    log('Animation controls created');
  }
  
  function testFullSequence() {
    log('Testing full animation sequence...');
    
    // 1. Pitcher throws
    window.play('pitch', {
      animation: {
        triggerPitcher: true,
        ballPhysics: {
          enabled: true,
          velocity: 95,
          location: { x: 0.1, z: 2.5 }
        }
      }
    });
    
    // 2. Batter swings (delayed)
    setTimeout(() => {
      window.play('swing', { animation: { triggerBatter: true } });
    }, 800);
  }
  
  function stopAllAnimations() {
    log('Stopping all animations...');
    
    Object.values(window.gc.mixers).forEach(mixer => {
      if (mixer) mixer.stopAllAction();
    });
    
    currentAnimations.pitcher = null;
    currentAnimations.batter = null;
    
    // Stop ball
    if (window.gc.nodes?.ball) {
      window.gc.nodes.ball.userData.v = null;
    }
    
    log('All animations stopped');
  }
  
  // Add status display
  function addAnimationStatus() {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'animationStatus';
    statusDiv.style.cssText = `
      position: absolute; bottom: 60px; left: 10px;
      background: rgba(0,0,0,0.8); color: #00ff88;
      padding: 8px; border-radius: 5px; font-size: 11px;
      font-family: monospace; border: 1px solid rgba(0,255,136,0.3);
      z-index: 1000;
    `;
    document.body.appendChild(statusDiv);
    
    setInterval(() => {
      const pitcherActive = currentAnimations.pitcher?.isRunning() || false;
      const batterActive = currentAnimations.batter?.isRunning() || false;
      const ballActive = !!window.gc.nodes?.ball?.userData?.v;
      
      statusDiv.innerHTML = `
        <div>🤾 Pitcher: ${pitcherActive ? 'Active' : 'Idle'}</div>
        <div>🏏 Batter: ${batterActive ? 'Active' : 'Idle'}</div>
        <div>⚾ Ball: ${ballActive ? 'Flying' : 'Static'}</div>
        <div style="margin-top: 4px; font-size: 9px; opacity: 0.7;">✅ Animations Fixed</div>
      `;
    }, 250);
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForGameCast);
  } else {
    waitForGameCast();
  }
  
  document.addEventListener('gc:ready', () => {
    setTimeout(() => {
      waitForGameCast();
      addAnimationStatus();
    }, 1000);
  });
  
  // Export for debugging
  window.animationController = {
    testPitcher: () => window.play('pitch', { animation: { triggerPitcher: true } }),
    testBatter: () => window.play('swing', { animation: { triggerBatter: true } }),
    testSequence: testFullSequence,
    stopAll: stopAllAnimations,
    getStatus: () => currentAnimations
  };
  
  log('Animation controller script loaded');
  
})();