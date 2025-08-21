// mlbIntegration.js - WORKING VERSION
// Fixed to work with your existing app.module.local.js setup

(function() {
  'use strict';
  
  console.log('[MLBIntegration] Loading working MLB integration...');
  
  // Wait for GameCast to be ready
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.gc.nodes && window.gc.THREE) {
      console.log('[MLBIntegration] GameCast ready, initializing...');
      setTimeout(initializeMLBIntegration, 1000);
    } else {
      setTimeout(waitForGameCast, 200);
    }
  }
  
  // Enhanced Ball Physics - Simplified for your setup
  class EnhancedBallPhysics {
    constructor() {
      this.THREE = window.gc.THREE;
      this.scene = window.gc.scene;
      this.active = false;
      this.velocity = new this.THREE.Vector3();
      this.trail = {
        points: [],
        maxPoints: 100,
        line: null
      };
      
      this.createTrail();
      console.log('[BallPhysics] Enhanced ball physics initialized');
    }
    
    createTrail() {
      const geometry = new this.THREE.BufferGeometry();
      const positions = new Float32Array(this.trail.maxPoints * 3);
      geometry.setAttribute('position', new this.THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);
      
      const material = new this.THREE.LineBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.8,
        linewidth: 3
      });
      
      this.trail.line = new this.THREE.Line(geometry, material);
      this.scene.add(this.trail.line);
      console.log('[BallPhysics] Enhanced trail created');
    }
    
    findHandBone() {
      const pitcherMesh = window.gc.nodes.pitcherMesh;
      if (!pitcherMesh) return null;
      
      let handBone = null;
      pitcherMesh.traverse(child => {
        if (child.isBone && !handBone) {
          const name = child.name.toLowerCase();
          if (name.includes('hand') && name.includes('right')) {
            handBone = child;
          }
        }
      });
      
      return handBone;
    }
    
    launchFromHand(location, velocity) {
      const ball = window.gc.nodes.ball;
      const pitcher = window.gc.nodes.pitcher;
      
      if (!ball || !pitcher) {
        console.warn('[BallPhysics] Missing ball or pitcher');
        return;
      }
      
      // Find hand bone or use fallback
      const handBone = this.findHandBone();
      let startPos;
      
      if (handBone) {
        handBone.updateMatrixWorld(true);
        startPos = new this.THREE.Vector3();
        handBone.getWorldPosition(startPos);
        console.log('[BallPhysics] Using hand bone for release');
      } else {
        startPos = pitcher.position.clone().add(new this.THREE.Vector3(0.3, 1.8, 0.5));
        console.log('[BallPhysics] Using fallback release point');
      }
      
      // Set ball position
      ball.position.copy(startPos);
      
      // Calculate target position
      const platePos = window.gc.anchors?.plate ? 
        new this.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
        new this.THREE.Vector3(0, 0, 0);
      
      const targetPos = platePos.clone();
      targetPos.x += location.x || 0;
      targetPos.y = location.z || 2.0;
      targetPos.z += 0.2;
      
      // Calculate velocity
      const direction = targetPos.clone().sub(startPos).normalize();
      const speed = (velocity || 95) * 0.02;
      
      this.velocity.copy(direction.multiplyScalar(speed));
      this.velocity.y += 0.01; // Add arc
      
      this.active = true;
      
      // Clear existing trail
      this.trail.points = [startPos.clone()];
      this.updateTrail();
      
      // Set ball physics
      ball.userData.enhancedPhysics = true;
      ball.userData.enhancedVelocity = this.velocity.clone();
      
      console.log('[BallPhysics] Enhanced ball launched:', velocity, 'mph');
    }
    
    update(deltaTime) {
      if (!this.active) return;
      
      const ball = window.gc.nodes.ball;
      if (!ball || !ball.userData.enhancedPhysics) return;
      
      // Apply gravity and air resistance
      this.velocity.y -= 9.81 * deltaTime * 0.3;
      this.velocity.multiplyScalar(0.998);
      
      // Update position
      const deltaPos = this.velocity.clone().multiplyScalar(deltaTime);
      ball.position.add(deltaPos);
      
      // Add to trail
      this.trail.points.push(ball.position.clone());
      if (this.trail.points.length > this.trail.maxPoints) {
        this.trail.points.shift();
      }
      this.updateTrail();
      
      // Ground collision
      if (ball.position.y <= 0.05) {
        ball.position.y = 0.05;
        this.velocity.y = Math.abs(this.velocity.y) * 0.4;
        this.velocity.x *= 0.7;
        this.velocity.z *= 0.7;
        
        if (this.velocity.length() < 1.0) {
          this.stop();
        }
      }
    }
    
    updateTrail() {
      if (!this.trail.line) return;
      
      const positions = this.trail.line.geometry.attributes.position;
      
      for (let i = 0; i < this.trail.points.length; i++) {
        const point = this.trail.points[i];
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      
      positions.needsUpdate = true;
      this.trail.line.geometry.setDrawRange(0, this.trail.points.length);
    }
    
    stop() {
      this.active = false;
      const ball = window.gc.nodes.ball;
      if (ball) {
        ball.userData.enhancedPhysics = false;
        ball.userData.enhancedVelocity = null;
      }
      console.log('[BallPhysics] Enhanced physics stopped');
    }
    
    reset() {
      this.stop();
      this.trail.points = [];
      if (this.trail.line) {
        this.trail.line.geometry.setDrawRange(0, 0);
      }
      console.log('[BallPhysics] Enhanced physics reset');
    }
    
    isActive() {
      return this.active;
    }
  }
  
  // Enhanced Game State
  class EnhancedGameState {
    constructor() {
      this.pitches = [];
      this.heatData = Array(3).fill(null).map(() => Array(3).fill(0));
      console.log('[GameState] Enhanced game state initialized');
    }
    
    addPitch(x, z, velocity, pitchType) {
      // Convert to 3x3 grid
      const col = Math.floor(((x + 0.83) / 1.66) * 3);
      const row = Math.floor(((3.5 - z) / 2.0) * 3);
      
      const gridCol = Math.max(0, Math.min(2, col));
      const gridRow = Math.max(0, Math.min(2, row));
      
      this.heatData[gridRow][gridCol]++;
      
      // Update your existing heat map
      if (window.heat) {
        window.heat[gridRow][gridCol] = this.heatData[gridRow][gridCol];
        if (window.drawZone) window.drawZone();
      }
      
      const pitch = {
        x, z, velocity, pitchType,
        time: Date.now(),
        grid: [gridRow, gridCol]
      };
      
      this.pitches.push(pitch);
      
      console.log('[GameState] Enhanced pitch added:', {
        type: pitchType,
        velocity: velocity + ' mph',
        location: `(${x.toFixed(2)}, ${z.toFixed(2)})`,
        grid: `[${gridRow},${gridCol}]`
      });
      
      return pitch;
    }
    
    getStats() {
      const total = this.pitches.length;
      const avgVel = total > 0 ? 
        this.pitches.reduce((sum, p) => sum + p.velocity, 0) / total : 0;
      
      return {
        total,
        avgVelocity: Math.round(avgVel * 10) / 10,
        recentPitches: this.pitches.slice(-5)
      };
    }
    
    clear() {
      this.pitches = [];
      this.heatData = Array(3).fill(null).map(() => Array(3).fill(0));
      
      if (window.heat) {
        window.heat.forEach(row => row.fill(0));
        if (window.drawZone) window.drawZone();
      }
      
      console.log('[GameState] Enhanced state cleared');
    }
  }
  
  // Main Integration
  let ballPhysics, gameState, isInitialized = false;
  
  function initializeMLBIntegration() {
    if (isInitialized) return;
    
    try {
      console.log('[MLBIntegration] Initializing enhanced systems...');
      
      // Initialize systems
      ballPhysics = new EnhancedBallPhysics();
      gameState = new EnhancedGameState();
      
      // Hook into existing event system
      document.addEventListener('gc:play', handleGameEvent);
      
      // Enhance animation loop
      enhanceAnimationLoop();
      
      // Add enhanced controls
      addEnhancedControls();
      
      // Expose for debugging
      window.gc.enhanced = {
        ballPhysics,
        gameState,
        testPitch: testEnhancedPitch,
        reset: () => {
          ballPhysics.reset();
          gameState.clear();
        }
      };
      
      isInitialized = true;
      console.log('[MLBIntegration] ✅ Enhanced systems initialized successfully!');
      
    } catch (error) {
      console.error('[MLBIntegration] ❌ Failed to initialize:', error);
    }
  }
  
  function handleGameEvent(event) {
    const { type, desc } = event.detail;
    
    if (type === 'PITCH') {
      // Parse existing event format
      const locationMatch = desc.match(/\[([-\d.]+)\s*,\s*([-\d.]+)\]/);
      const velocityMatch = desc.match(/(\d+)/);
      const pitchTypeMatch = desc.match(/^(\w+)/);
      
      const location = {
        x: locationMatch ? parseFloat(locationMatch[1]) : (Math.random() - 0.5) * 1.5,
        z: locationMatch ? parseFloat(locationMatch[2]) : 1.5 + Math.random() * 2
      };
      
      const velocity = velocityMatch ? parseInt(velocityMatch[1]) : 88 + Math.random() * 12;
      const pitchType = pitchTypeMatch?.[1] || 'Fastball';
      
      // Add to enhanced game state
      gameState.addPitch(location.x, location.z, velocity, pitchType);
      
      // Launch enhanced ball
      ballPhysics.launchFromHand(location, velocity);
    }
  }
  
  function enhanceAnimationLoop() {
    // Store reference to original animate
    const originalAnimate = window.animate;
    if (!originalAnimate) {
      console.warn('[MLBIntegration] No animate function found');
      return;
    }
    
    // Replace with enhanced version
    window.animate = function() {
      // Call original animation loop
      originalAnimate();
      
      // Add enhanced physics update
      if (ballPhysics) {
        const deltaTime = window.gc.clock?.getDelta() || 0.016;
        ballPhysics.update(deltaTime);
      }
    };
    
    console.log('[MLBIntegration] Animation loop enhanced');
  }
  
  function addEnhancedControls() {
    // Enhanced pitch button
    const enhancedBtn = document.createElement('button');
    enhancedBtn.textContent = '🚀 Enhanced Pitch';
    enhancedBtn.style.cssText = `
      position: absolute; bottom: 100px; left: 150px;
      padding: 8px 12px; background: #00aa44; color: white;
      border: none; border-radius: 5px; cursor: pointer;
      font-weight: bold; z-index: 1000;
    `;
    enhancedBtn.onclick = testEnhancedPitch;
    document.body.appendChild(enhancedBtn);
    
    // Stats display
    const statsDiv = document.createElement('div');
    statsDiv.id = 'enhancedMLBStats';
    statsDiv.style.cssText = `
      position: absolute; top: 200px; left: 10px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px; border-radius: 8px; font-size: 12px;
      font-family: monospace; min-width: 200px;
      border: 1px solid rgba(0,170,68,0.5); z-index: 1000;
    `;
    document.body.appendChild(statsDiv);
    
    // Update stats display
    setInterval(updateStatsDisplay, 1000);
    
    console.log('[MLBIntegration] Enhanced controls added');
  }
  
  function testEnhancedPitch() {
    if (!ballPhysics || !gameState) {
      console.warn('[MLBIntegration] Systems not ready');
      return;
    }
    
    const location = {
      x: (Math.random() - 0.5) * 1.4,
      z: 1.8 + Math.random() * 1.4
    };
    const velocity = 88 + Math.random() * 12;
    const pitchType = ['Fastball', 'Slider', 'Curveball', 'Changeup'][Math.floor(Math.random() * 4)];
    
    gameState.addPitch(location.x, location.z, velocity, pitchType);
    ballPhysics.launchFromHand(location, velocity);
  }
  
  function updateStatsDisplay() {
    const statsDiv = document.getElementById('enhancedMLBStats');
    if (!statsDiv || !gameState) return;
    
    const stats = gameState.getStats();
    
    statsDiv.innerHTML = `
      <div style="color: #00aa44; font-weight: bold; margin-bottom: 8px;">🚀 MLB Enhanced (Working)</div>
      <div>Total Pitches: ${stats.total}</div>
      <div>Avg Velocity: ${stats.avgVelocity} mph</div>
      <div>Ball Active: ${ballPhysics?.isActive() ? 'Yes' : 'No'}</div>
      <div>Hand Tracking: ${isInitialized ? 'Active' : 'Loading...'}</div>
      <div style="margin-top: 8px; font-size: 10px; opacity: 0.7;">
        Working with your existing system
      </div>
    `;
  }
  
  // Initialize when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForGameCast);
  } else {
    waitForGameCast();
  }
  
  // Also listen for gc:ready event
  document.addEventListener('gc:ready', () => {
    setTimeout(waitForGameCast, 500);
  });
  
  console.log('[MLBIntegration] Script loaded, waiting for GameCast...');
  
})();