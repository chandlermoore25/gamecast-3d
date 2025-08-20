// simpleEnhancement.js - Single file enhancement that works with your existing system
// Just add this script tag to your HTML after your existing scripts

(function() {
  'use strict';
  
  console.log('[Enhancement] Loading simple ball tracing enhancement...');
  
  // Wait for your existing system to be ready
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.gc.nodes) {
      console.log('[Enhancement] GameCast detected, initializing...');
      setTimeout(initializeEnhancements, 500);
    } else {
      setTimeout(waitForGameCast, 100);
    }
  }
  
  // Enhanced ball physics (simplified)
  class SimpleBallPhysics {
    constructor() {
      this.active = false;
      this.velocity = new THREE.Vector3();
      this.trail = [];
      this.maxTrail = 100;
      this.trailLine = null;
      
      this.createTrail();
    }
    
    createTrail() {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(this.maxTrail * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);
      
      const material = new THREE.LineBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
        linewidth: 2
      });
      
      this.trailLine = new THREE.Line(geometry, material);
      window.gc.scene.add(this.trailLine);
    }
    
    findHandBone(pitcherMesh) {
      let handBone = null;
      
      if (!pitcherMesh) return null;
      
      pitcherMesh.traverse(child => {
        if (child.isBone && !handBone) {
          const name = child.name.toLowerCase();
          if (name.includes('hand') && name.includes('r')) {
            handBone = child;
          }
        }
      });
      
      return handBone;
    }
    
    launchFromHand(location, velocity) {
      const ball = window.gc.nodes.ball;
      const pitcher = window.gc.nodes.pitcher;
      const pitcherMesh = window.gc.nodes.pitcherMesh;
      
      if (!ball || !pitcher) return;
      
      // Find hand bone or use fallback
      const handBone = this.findHandBone(pitcherMesh);
      let startPos;
      
      if (handBone) {
        handBone.updateMatrixWorld(true);
        startPos = new THREE.Vector3();
        handBone.getWorldPosition(startPos);
        console.log('[Enhancement] Using hand bone release point');
      } else {
        startPos = pitcher.position.clone().add(new THREE.Vector3(0.3, 1.8, 0.5));
        console.log('[Enhancement] Using fallback release point');
      }
      
      // Set ball position
      ball.position.copy(startPos);
      
      // Calculate target position
      const platePos = window.gc.anchors?.plate ? 
        new THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
        new THREE.Vector3(0, 0, 0);
      
      const targetPos = platePos.clone();
      targetPos.x += location.x || 0;
      targetPos.y = location.z || 2.0;
      targetPos.z += 0.2;
      
      // Calculate velocity
      const direction = targetPos.clone().sub(startPos).normalize();
      const speed = (velocity || 95) * 0.02;
      
      this.velocity.copy(direction.multiplyScalar(speed));
      this.active = true;
      
      // Clear trail
      this.trail = [startPos.clone()];
      this.updateTrail();
      
      console.log('[Enhancement] Ball launched from hand at', velocity, 'mph');
    }
    
    update(deltaTime) {
      if (!this.active) return;
      
      const ball = window.gc.nodes.ball;
      if (!ball) return;
      
      // Apply gravity
      this.velocity.y -= 9.81 * deltaTime * 0.3;
      
      // Update position
      ball.position.add(this.velocity.clone().multiplyScalar(deltaTime));
      
      // Add to trail
      this.trail.push(ball.position.clone());
      if (this.trail.length > this.maxTrail) {
        this.trail.shift();
      }
      
      this.updateTrail();
      
      // Ground collision
      if (ball.position.y <= 0.05) {
        ball.position.y = 0.05;
        this.velocity.y = Math.abs(this.velocity.y) * 0.4;
        this.velocity.x *= 0.7;
        this.velocity.z *= 0.7;
        
        if (this.velocity.length() < 1.0) {
          this.active = false;
        }
      }
    }
    
    updateTrail() {
      if (!this.trailLine) return;
      
      const positions = this.trailLine.geometry.attributes.position;
      
      for (let i = 0; i < this.trail.length; i++) {
        const point = this.trail[i];
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      
      positions.needsUpdate = true;
      this.trailLine.geometry.setDrawRange(0, this.trail.length);
    }
    
    reset() {
      this.active = false;
      this.trail = [];
      this.velocity.set(0, 0, 0);
      if (this.trailLine) {
        this.trailLine.geometry.setDrawRange(0, 0);
      }
    }
  }
  
  // Simple game state
  class SimpleGameState {
    constructor() {
      this.heatData = Array(3).fill(null).map(() => Array(3).fill(0));
      this.pitches = [];
    }
    
    addPitch(x, z, velocity) {
      // Convert to 3x3 grid
      const col = Math.floor(((x + 0.83) / 1.66) * 3);
      const row = Math.floor(((3.5 - z) / 2.0) * 3);
      
      if (row >= 0 && row < 3 && col >= 0 && col < 3) {
        this.heatData[row][col]++;
        
        // Update your existing heat map
        if (window.heat) {
          window.heat[row][col] = this.heatData[row][col];
          if (window.drawZone) window.drawZone();
        }
      }
      
      this.pitches.push({ x, z, velocity, time: Date.now() });
      console.log('[Enhancement] Added pitch to heat map:', { x, z, velocity });
    }
    
    getStats() {
      return {
        total: this.pitches.length,
        avgVelocity: this.pitches.length > 0 ? 
          this.pitches.reduce((sum, p) => sum + p.velocity, 0) / this.pitches.length : 0
      };
    }
    
    clear() {
      this.heatData = Array(3).fill(null).map(() => Array(3).fill(0));
      this.pitches = [];
      
      if (window.heat) {
        window.heat.forEach(row => row.fill(0));
        if (window.drawZone) window.drawZone();
      }
    }
  }
  
  let ballPhysics, gameState;
  
  function initializeEnhancements() {
    // Ensure THREE is available (module build may load it asynchronously)
    if (typeof window === 'undefined' || !window.THREE) {
      console.warn('[Enhancement] THREE not defined yet; retrying...');
      return setTimeout(initializeEnhancements, 250);
    }
    
    try {
      // Initialize systems
      ballPhysics = new SimpleBallPhysics();
      gameState = new SimpleGameState();
      
      // Hook into existing game events
      document.addEventListener('gc:play', handleGameEvent);
      
      // Enhance existing animation loop
      enhanceAnimationLoop();
      
      // Add controls
      addEnhancementControls();
      
      // Expose for debugging
      window.gc.enhanced = { ballPhysics, gameState };
      
      console.log('[Enhancement] Simple enhancements initialized successfully');
      
    } catch (error) {
      console.error('[Enhancement] Failed to initialize:', error);
    }
  }
  
  function handleGameEvent(event) {
    const { type, desc } = event.detail;
    
    if (type === 'PITCH') {
      // Parse your existing event format
      const locationMatch = desc.match(/\[([-\d.]+)\s*,\s*([-\d.]+)\]/);
      const velocityMatch = desc.match(/(\d+)/);
      
      const location = {
        x: locationMatch ? parseFloat(locationMatch[1]) : (Math.random() - 0.5) * 1.5,
        z: locationMatch ? parseFloat(locationMatch[2]) : 1.5 + Math.random() * 2
      };
      
      const velocity = velocityMatch ? parseInt(velocityMatch[1]) : 88 + Math.random() * 12;
      
      // Launch enhanced ball
      ballPhysics.launchFromHand(location, velocity);
      
      // Add to game state
      gameState.addPitch(location.x, location.z, velocity);
    }
  }
  
  function enhanceAnimationLoop() {
    // Store reference to original animate
    const originalAnimate = window.animate;
    if (!originalAnimate) return;
    
    // Replace with enhanced version
    window.animate = function() {
      // Call original
      originalAnimate();
      
      // Add enhanced physics
      if (ballPhysics) {
        const deltaTime = window.gc.clock?.getDelta() || 0.016;
        ballPhysics.update(deltaTime);
      }
    };
    
    console.log('[Enhancement] Animation loop enhanced');
  }
  
  function addEnhancementControls() {
    // Enhanced pitch button
    const enhancedBtn = document.createElement('button');
    enhancedBtn.textContent = '⚡ Enhanced Pitch';
    enhancedBtn.style.cssText = `
      position: absolute; bottom: 100px; left: 10px;
      padding: 8px 12px; background: #ff6600; color: white;
      border: none; border-radius: 5px; cursor: pointer;
      font-weight: bold; z-index: 1000;
    `;
    enhancedBtn.onclick = testEnhancedPitch;
    document.body.appendChild(enhancedBtn);
    
    // Stats display
    const statsDiv = document.createElement('div');
    statsDiv.id = 'enhancedStats';
    statsDiv.style.cssText = `
      position: absolute; top: 200px; left: 10px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px; border-radius: 8px; font-size: 12px;
      font-family: monospace; min-width: 180px;
      border: 1px solid rgba(255,255,255,0.3);
    `;
    document.body.appendChild(statsDiv);
    
    // Update stats
    setInterval(updateStatsDisplay, 1000);
    
    console.log('[Enhancement] Controls added');
  }
  
  function testEnhancedPitch() {
    const location = {
      x: (Math.random() - 0.5) * 1.4,
      z: 1.8 + Math.random() * 1.4
    };
    const velocity = 88 + Math.random() * 12;
    
    ballPhysics.launchFromHand(location, velocity);
    gameState.addPitch(location.x, location.z, velocity);
  }
  
  function updateStatsDisplay() {
    const statsDiv = document.getElementById('enhancedStats');
    if (!statsDiv || !gameState) return;
    
    const stats = gameState.getStats();
    
    statsDiv.innerHTML = `
      <div style="color: #ffaa00; font-weight: bold; margin-bottom: 5px;">⚡ Enhanced Stats</div>
      <div>Total Pitches: ${stats.total}</div>
      <div>Avg Velocity: ${stats.avgVelocity.toFixed(1)} mph</div>
      <div>Ball Active: ${ballPhysics?.active ? 'Yes' : 'No'}</div>
      <div style="margin-top: 5px; font-size: 10px; opacity: 0.7;">
        Hand tracking: ${ballPhysics ? 'Active' : 'Off'}
      </div>
    `;
  }
  
  // Start initialization
  waitForGameCast();
  
})();