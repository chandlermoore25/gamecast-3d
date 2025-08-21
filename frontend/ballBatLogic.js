// ballBatLogic.js - ENHANCED VERSION
// Handles realistic ball physics and bat interactions

(function() {
  'use strict';
  
  console.log('[BallBatLogic] Loading enhanced ball and bat logic...');
  
  let isInitialized = false;
  let ballState = {
    isFlying: false,
    velocity: null,
    startTime: 0,
    pitchData: null
  };
  
  let batState = {
    isSwinging: false,
    swingStartTime: 0,
    contactZone: null
  };
  
  function log(...args) {
    console.log('[BALL_BAT]', ...args);
  }
  
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.gc.nodes && window.gc.THREE) {
      log('GameCast detected, initializing ball/bat logic...');
      setTimeout(initializeBallBatLogic, 1000);
    } else {
      setTimeout(waitForGameCast, 200);
    }
  }
  
  function initializeBallBatLogic() {
    if (isInitialized) return;
    
    try {
      // Check for ball and bat objects
      checkGameObjects();
      
      // Initialize enhanced ball physics
      initializeEnhancedBallPhysics();
      
      // Initialize bat mechanics
      initializeBatMechanics();
      
      // Hook into game events
      document.addEventListener('gc:play', handleBallBatEvent);
      
      // Enhance animation loop
      enhancePhysicsLoop();
      
      // Create controls
      createBallBatControls();
      
      isInitialized = true;
      log('✅ Ball/Bat logic initialized');
      
    } catch (error) {
      console.error('[BallBatLogic] ❌ Failed to initialize:', error);
    }
  }
  
  function checkGameObjects() {
    const objects = {
      ball: !!window.gc.nodes?.ball,
      bat: !!window.gc.nodes?.bat,
      pitcher: !!window.gc.nodes?.pitcher,
      batter: !!window.gc.nodes?.batter
    };
    
    log('Game objects status:', objects);
    
    // Create missing objects if needed
    if (!objects.ball) {
      log('❌ Ball not found, checking primitives...');
      // Ball should be created by tweaks.primitives.js
    }
    
    if (!objects.bat) {
      log('❌ Bat not found, checking primitives...');
      // Bat should be created by tweaks.primitives.js
    }
    
    return objects;
  }
  
  function initializeEnhancedBallPhysics() {
    const ball = window.gc.nodes?.ball;
    if (!ball) {
      log('❌ Cannot initialize ball physics - no ball found');
      return;
    }
    
    // Create enhanced trail system
    const trailGeometry = new window.gc.THREE.BufferGeometry();
    const maxTrailPoints = 200;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailColors = new Float32Array(maxTrailPoints * 3);
    
    trailGeometry.setAttribute('position', new window.gc.THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute('color', new window.gc.THREE.BufferAttribute(trailColors, 3));
    trailGeometry.setDrawRange(0, 0);
    
    const trailMaterial = new window.gc.THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      linewidth: 3
    });
    
    const trailLine = new window.gc.THREE.Line(trailGeometry, trailMaterial);
    window.gc.scene.add(trailLine);
    
    // Store enhanced trail system
    window.gc.ballTrail = {
      line: trailLine,
      positions: trailPositions,
      colors: trailColors,
      count: 0,
      maxPoints: maxTrailPoints
    };
    
    log('✅ Enhanced ball physics initialized');
  }
  
  function initializeBatMechanics() {
    const bat = window.gc.nodes?.bat;
    const batter = window.gc.nodes?.batter;
    
    if (!bat || !batter) {
      log('❌ Cannot initialize bat mechanics - missing bat or batter');
      return;
    }
    
    // Position bat relative to batter
    positionBatWithBatter();
    
    // Create contact zone visualization (invisible helper)
    const contactZoneGeometry = new window.gc.THREE.SphereGeometry(0.5, 8, 6);
    const contactZoneMaterial = new window.gc.THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0, // Invisible but collision-detectable
      wireframe: true
    });
    
    const contactZone = new window.gc.THREE.Mesh(contactZoneGeometry, contactZoneMaterial);
    contactZone.name = 'BatContactZone';
    bat.add(contactZone);
    
    // Position contact zone at bat barrel
    contactZone.position.set(0, 0.6, 0); // Near bat tip
    
    batState.contactZone = contactZone;
    
    log('✅ Bat mechanics initialized');
  }
  
  function positionBatWithBatter() {
    const bat = window.gc.nodes?.bat;
    const batter = window.gc.nodes?.batter;
    
    if (!bat || !batter) return;
    
    // Position bat relative to batter's position
    bat.position.copy(batter.position);
    bat.position.x += (window.gc.state?.batterHand === 'R') ? 0.5 : -0.5;
    bat.position.y += 1.2; // Chest height
    bat.position.z += 0.2; // Slightly forward
    
    // Set bat rotation for ready position
    bat.rotation.set(0, 0, (window.gc.state?.batterHand === 'R') ? -0.3 : 0.3);
    
    log('Bat positioned for', window.gc.state?.batterHand || 'R', 'handed batter');
  }
  
  function handleBallBatEvent(event) {
    const { type, desc, animation } = event.detail;
    
    log('Handling ball/bat event:', type);
    
    // Handle ball launch
    if (type === 'PITCH' && animation?.ballPhysics?.enabled) {
      launchEnhancedBall(animation.ballPhysics);
    }
    
    // Handle bat swing
    if (['SWING', 'CONTACT', 'FOUL'].includes(type)) {
      triggerBatSwing(type, event.detail);
    }
  }
  
  function launchEnhancedBall(ballPhysics) {
    const ball = window.gc.nodes?.ball;
    const pitcher = window.gc.nodes?.pitcher;
    
    if (!ball || !pitcher) {
      log('❌ Cannot launch ball - missing objects');
      return;
    }
    
    // Find pitcher's hand for realistic release point
    const releasePoint = findPitcherReleasePoint(pitcher);
    
    // Set ball position at release point
    ball.position.copy(releasePoint);
    
    // Calculate target position from MLB coordinates
    const targetPoint = calculateTargetPosition(ballPhysics.location);
    
    // Calculate realistic trajectory
    const trajectory = calculateBallTrajectory(releasePoint, targetPoint, ballPhysics.velocity);
    
    // Set ball state
    ballState = {
      isFlying: true,
      velocity: trajectory.velocity.clone(),
      startTime: performance.now(),
      pitchData: ballPhysics
    };
    
    // Store velocity in ball userData for animation loop
    ball.userData.enhancedVelocity = trajectory.velocity.clone();
    ball.userData.isEnhanced = true;
    
    // Clear and initialize trail
    clearBallTrail();
    addTrailPoint(ball.position, ballPhysics.velocity);
    
    log('🚀 Enhanced ball launched:', {
      velocity: ballPhysics.velocity + ' mph',
      location: `(${ballPhysics.location.x.toFixed(2)}, ${ballPhysics.location.z.toFixed(2)})`,
      trajectory: trajectory.velocity.toArray().map(n => n.toFixed(3))
    });
  }
  
  function findPitcherReleasePoint(pitcher) {
    const pitcherMesh = window.gc.nodes?.pitcherMesh;
    
    if (pitcherMesh) {
      // Try to find hand bone
      let handBone = null;
      pitcherMesh.traverse(child => {
        if (child.isBone && !handBone) {
          const name = child.name.toLowerCase();
          if (name.includes('hand') && name.includes('right')) {
            handBone = child;
          }
        }
      });
      
      if (handBone) {
        handBone.updateMatrixWorld(true);
        const handPos = new window.gc.THREE.Vector3();
        handBone.getWorldPosition(handPos);
        log('Using hand bone for release point');
        return handPos;
      }
    }
    
    // Fallback to pitcher position with offset
    const releasePoint = pitcher.position.clone();
    releasePoint.add(new window.gc.THREE.Vector3(0.3, 1.8, 0.5));
    log('Using fallback release point');
    return releasePoint;
  }
  
  function calculateTargetPosition(location) {
    // Get home plate position
    const platePos = window.gc.anchors?.plate ? 
      new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
      new window.gc.THREE.Vector3(0, 0, 0);
    
    // Convert MLB coordinates to world coordinates
    const targetPos = platePos.clone();
    targetPos.x += location.x * 50; // Scale MLB x coordinate
    targetPos.y = Math.max(5, location.z * 25); // Scale MLB z to height
    targetPos.z += 20; // Slightly in front of plate
    
    return targetPos;
  }
  
  function calculateBallTrajectory(start, target, velocityMph) {
    const direction = target.clone().sub(start);
    const distance = direction.length();
    direction.normalize();
    
    // Convert mph to 3D units per second
    const velocityUnitsPerSec = (velocityMph / 95) * 60; // Scaled for your world
    
    // Calculate flight time
    const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z) * distance;
    const flightTime = horizontalDistance / (velocityUnitsPerSec * 0.8);
    
    // Calculate velocity components with gravity compensation
    const gravity = -30; // Adjusted gravity for your scale
    const vy = (target.y - start.y + 0.5 * Math.abs(gravity) * flightTime * flightTime) / flightTime;
    
    const velocity = new window.gc.THREE.Vector3(
      direction.x * velocityUnitsPerSec,
      vy,
      direction.z * velocityUnitsPerSec
    );
    
    return { velocity, flightTime };
  }
  
  function triggerBatSwing(swingType, eventData) {
    const bat = window.gc.nodes?.bat;
    if (!bat) {
      log('❌ Cannot swing bat - no bat found');
      return;
    }
    
    log('🏏 Triggering bat swing:', swingType);
    
    batState.isSwinging = true;
    batState.swingStartTime = performance.now();
    
    // Animate bat swing
    animateBatSwing(swingType, eventData);
    
    // Check for ball contact during swing
    if (ballState.isFlying) {
      setTimeout(() => checkBallBatContact(), 100); // Check contact during swing
    }
  }
  
  function animateBatSwing(swingType, eventData) {
    const bat = window.gc.nodes?.bat;
    if (!bat) return;
    
    const isRightHanded = window.gc.state?.batterHand === 'R';
    const swingDirection = isRightHanded ? 1 : -1;
    
    // Store original rotation
    const originalRotation = bat.rotation.clone();
    
    // Swing animation using simple rotation
    const swingDuration = 300; // milliseconds
    const maxSwingAngle = Math.PI * 0.4; // Swing arc
    
    const startTime = performance.now();
    
    function animateSwing() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / swingDuration, 1);
      
      // Smooth swing curve
      const swingCurve = Math.sin(progress * Math.PI);
      const currentAngle = swingCurve * maxSwingAngle * swingDirection;
      
      bat.rotation.y = originalRotation.y + currentAngle;
      
      if (progress < 1) {
        requestAnimationFrame(animateSwing);
      } else {
        // Return to ready position
        setTimeout(() => {
          returnBatToReady(originalRotation);
          batState.isSwinging = false;
        }, 200);
      }
    }
    
    animateSwing();
  }
  
  function returnBatToReady(originalRotation) {
    const bat = window.gc.nodes?.bat;
    if (!bat) return;
    
    const returnDuration = 500;
    const startTime = performance.now();
    const startRotation = bat.rotation.clone();
    
    function animateReturn() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / returnDuration, 1);
      
      // Smooth ease-out
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      bat.rotation.y = startRotation.y + (originalRotation.y - startRotation.y) * easeProgress;
      
      if (progress < 1) {
        requestAnimationFrame(animateReturn);
      }
    }
    
    animateReturn();
  }
  
  function checkBallBatContact() {
    const ball = window.gc.nodes?.ball;
    const bat = window.gc.nodes?.bat;
    
    if (!ball || !bat || !ballState.isFlying || !batState.isSwinging) return;
    
    const contactZone = batState.contactZone;
    if (!contactZone) return;
    
    // Get world positions
    contactZone.updateMatrixWorld(true);
    const contactPos = new window.gc.THREE.Vector3();
    contactZone.getWorldPosition(contactPos);
    
    const ballPos = ball.position;
    const distance = ballPos.distanceTo(contactPos);
    
    // Check if ball is in contact zone
    if (distance < 1.0) { // Contact threshold
      handleBallBatContact(ballPos, contactPos);
    }
  }
  
  function handleBallBatContact(ballPos, contactPos) {
    log('💥 Ball-bat contact detected!');
    
    const ball = window.gc.nodes?.ball;
    if (!ball) return;
    
    // Calculate contact velocity based on swing speed and ball velocity
    const contactVelocity = calculateContactVelocity();
    
    // Apply new velocity to ball
    ball.userData.enhancedVelocity = contactVelocity;
    ballState.velocity = contactVelocity;
    
    // Visual/audio feedback
    createContactEffect(ballPos);
    
    // Update ball trail color for contact
    updateTrailForContact();
    
    log('Ball redirected with contact velocity:', contactVelocity.toArray().map(n => n.toFixed(2)));
  }
  
  function calculateContactVelocity() {
    const isRightHanded = window.gc.state?.batterHand === 'R';
    const contactDirection = isRightHanded ? 1 : -1;
    
    // Base contact velocity (toward first/third base)
    const contactVel = new window.gc.THREE.Vector3(
      contactDirection * 40, // Horizontal speed
      15, // Upward component
      30  // Forward component
    );
    
    // Add some randomness for realism
    contactVel.x += (Math.random() - 0.5) * 20;
    contactVel.y += (Math.random() - 0.5) * 10;
    contactVel.z += (Math.random() - 0.5) * 15;
    
    return contactVel;
  }
  
  function createContactEffect(position) {
    // Create a brief visual effect at contact point
    const effectGeometry = new window.gc.THREE.SphereGeometry(2, 8, 6);
    const effectMaterial = new window.gc.THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    
    const effect = new window.gc.THREE.Mesh(effectGeometry, effectMaterial);
    effect.position.copy(position);
    window.gc.scene.add(effect);
    
    // Animate and remove effect
    let scale = 1;
    const animate = () => {
      scale += 0.1;
      effect.scale.setScalar(scale);
      effectMaterial.opacity -= 0.05;
      
      if (effectMaterial.opacity > 0) {
        requestAnimationFrame(animate);
      } else {
        window.gc.scene.remove(effect);
      }
    };
    animate();
  }
  
  function updateTrailForContact() {
    // Change trail color to indicate contact
    if (window.gc.ballTrail) {
      const trail = window.gc.ballTrail;
      const colors = trail.colors;
      
      // Set recent trail points to contact color (yellow/orange)
      for (let i = Math.max(0, trail.count - 20); i < trail.count; i++) {
        colors[i * 3] = 1.0;     // R
        colors[i * 3 + 1] = 0.5; // G
        colors[i * 3 + 2] = 0.0; // B
      }
      
      trail.line.geometry.attributes.color.needsUpdate = true;
    }
  }
  
  function updateBallPhysics() {
    const ball = window.gc.nodes?.ball;
    if (!ball || !ballState.isFlying || !ball.userData.isEnhanced) return;
    
    const velocity = ball.userData.enhancedVelocity;
    if (!velocity) return;
    
    // Apply gravity
    velocity.y -= 1.5; // Gravity acceleration
    
    // Apply air resistance
    velocity.multiplyScalar(0.998);
    
    // Update position
    ball.position.add(velocity.clone().multiplyScalar(0.016)); // Assuming ~60fps
    
    // Add to trail
    addTrailPoint(ball.position, velocity.length() * 2.237); // Convert to mph for color
    
    // Ground collision
    if (ball.position.y <= 0.5) {
      ball.position.y = 0.5;
      velocity.y = Math.abs(velocity.y) * 0.4; // Bounce
      velocity.x *= 0.8; // Friction
      velocity.z *= 0.8;
      
      // Stop if velocity too low
      if (velocity.length() < 2) {
        stopBall();
      }
    }
  }
  
  function addTrailPoint(position, velocityMph) {
    const trail = window.gc.ballTrail;
    if (!trail) return;
    
    const { positions, colors, maxPoints } = trail;
    let { count } = trail;
    
    // Shift arrays if at capacity
    if (count >= maxPoints) {
      positions.copyWithin(0, 3, maxPoints * 3);
      colors.copyWithin(0, 3, maxPoints * 3);
      count = maxPoints - 1;
    }
    
    // Add position
    positions.set([position.x, position.y, position.z], count * 3);
    
    // Calculate color based on velocity (blue=slow, red=fast)
    const normalizedSpeed = Math.min(Math.max((velocityMph - 40) / 60, 0), 1);
    const r = normalizedSpeed;
    const g = 0.3;
    const b = 1 - normalizedSpeed;
    colors.set([r, g, b], count * 3);
    
    trail.count = count + 1;
    
    // Update geometry
    trail.line.geometry.attributes.position.needsUpdate = true;
    trail.line.geometry.attributes.color.needsUpdate = true;
    trail.line.geometry.setDrawRange(0, trail.count);
  }
  
  function clearBallTrail() {
    const trail = window.gc.ballTrail;
    if (!trail) return;
    
    trail.count = 0;
    trail.line.geometry.setDrawRange(0, 0);
  }
  
  function stopBall() {
    ballState.isFlying = false;
    const ball = window.gc.nodes?.ball;
    if (ball) {
      ball.userData.enhancedVelocity = null;
      ball.userData.isEnhanced = false;
    }
    log('⚾ Ball stopped');
  }
  
  function enhancePhysicsLoop() {
    const originalAnimate = window.animate;
    if (!originalAnimate) {
      log('❌ No animate function found');
      return;
    }
    
    window.animate = function() {
      // Call original animation loop
      originalAnimate();
      
      // Add enhanced ball physics
      updateBallPhysics();
    };
    
    log('✅ Physics loop enhanced');
  }
  
  function createBallBatControls() {
    const ui = document.getElementById('ui');
    if (!ui) return;
    
    // Remove existing controls
    const existing = document.getElementById('ballBatControls');
    if (existing) existing.remove();
    
    const controlsRow = document.createElement('div');
    controlsRow.className = 'row';
    controlsRow.id = 'ballBatControls';
    controlsRow.innerHTML = `
      <span class="badge">Ball/Bat:</span>
      <button id="testBallLaunch">Test Ball</button>
      <button id="testBatSwing">Test Swing</button>
      <button id="testContact">Test Contact</button>
      <button id="resetBallBat">Reset</button>
    `;
    
    ui.appendChild(controlsRow);
    
    // Wire up controls
    document.getElementById('testBallLaunch')?.addEventListener('click', () => {
      launchEnhancedBall({
        velocity: 95,
        location: { x: 0.1, z: 2.5 }
      });
    });
    
    document.getElementById('testBatSwing')?.addEventListener('click', () => {
      triggerBatSwing('SWING', {});
    });
    
    document.getElementById('testContact')?.addEventListener('click', () => {
      // Launch ball and swing bat with timing for contact
      launchEnhancedBall({
        velocity: 85,
        location: { x: 0.0, z: 2.3 }
      });
      
      setTimeout(() => {
        triggerBatSwing('CONTACT', {});
      }, 600);
    });
    
    document.getElementById('resetBallBat')?.addEventListener('click', () => {
      resetBallBatSystem();
    });
    
    log('Ball/Bat controls created');
  }
  
  function resetBallBatSystem() {
    log('Resetting ball/bat system...');
    
    // Stop ball
    stopBall();
    
    // Reset ball position
    const ball = window.gc.nodes?.ball;
    const pitcher = window.gc.nodes?.pitcher;
    if (ball && pitcher) {
      ball.position.copy(pitcher.position);
      ball.position.y += 1.8;
    }
    
    // Reset bat
    batState.isSwinging = false;
    positionBatWithBatter();
    
    // Clear trail
    clearBallTrail();
    
    log('Ball/bat system reset');
  }
  
  // Add status display
  function addBallBatStatus() {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'ballBatStatus';
    statusDiv.style.cssText = `
      position: absolute; bottom: 120px; left: 10px;
      background: rgba(0,0,0,0.8); color: #ffaa00;
      padding: 8px; border-radius: 5px; font-size: 11px;
      font-family: monospace; border: 1px solid rgba(255,170,0,0.3);
      z-index: 1000;
    `;
    document.body.appendChild(statusDiv);
    
    setInterval(() => {
      const ballFlying = ballState.isFlying;
      const batSwinging = batState.isSwinging;
      const trailPoints = window.gc.ballTrail?.count || 0;
      
      statusDiv.innerHTML = `
        <div>⚾ Ball: ${ballFlying ? 'Flying' : 'Static'}</div>
        <div>🏏 Bat: ${batSwinging ? 'Swinging' : 'Ready'}</div>
        <div>📈 Trail: ${trailPoints} points</div>
        <div style="margin-top: 4px; font-size: 9px; opacity: 0.7;">✅ Enhanced Physics</div>
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
      addBallBatStatus();
    }, 1500);
  });
  
  // Export for debugging
  window.ballBatLogic = {
    launchBall: launchEnhancedBall,
    swingBat: triggerBatSwing,
    reset: resetBallBatSystem,
    getStatus: () => ({ ballState, batState })
  };
  
  log('Ball/Bat logic script loaded');
  
})();