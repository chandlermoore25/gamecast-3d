// simpleEnhancement.js - FIXED VERSION
// Fixed THREE.js reference and animation loop timing issues

(function() {
  'use strict';
  
  console.log('[Enhancement] Loading FIXED simple ball tracing enhancement...');
  
  let ballPhysics, gameState, initialized = false;
  
  // Wait for your existing system to be ready
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.gc.nodes && window.gc.THREE && window.animate) {
      console.log('[Enhancement] GameCast fully detected, initializing...');
      setTimeout(initializeEnhancements, 1000); // Wait longer for full initialization
    } else {
      setTimeout(waitForGameCast, 200);
    }
  }
  
  // Enhanced ball physics (FIXED: using window.gc.THREE)
  class SimpleBallPhysics {
    constructor() {
      this.THREE = window.gc.THREE; // FIXED: Use your existing THREE reference
      this.active = false;
      this.velocity = new this.THREE.Vector3();
      this.trail = [];
      this.maxTrail = 100;
      this.trailLine = null;
      
      this.createTrail();
    }
    
    createTrail() {
      const geometry = new this.THREE.BufferGeometry();
      const positions = new Float32Array(this.maxTrail * 3);
      geometry.setAttribute('position', new this.THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);
      
      const material = new this.THREE.LineBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
        linewidth: 2
      });
      
      this.trailLine = new this.THREE.Line(geometry, material);
      window.gc.scene.add(this.trailLine);
      console.log('[Enhancement] Ball trail created');
    }
    
    findHandBone(pitcherMesh) {
      let handBone = null;
      
      if (!pitcherMesh) return null;
      
      pitcherMesh.traverse(child => {
        if (child.isBone && !handBone) {
          const name = child.name.toLowerCase();
          // Look for right hand (throwing hand)
          if ((name.includes('hand') || name.includes('wrist')) && 
              (name.includes('right') || name.includes('r_') || name.includes('_r'))) {
            handBone = child;
          }
        }
      });
      
      // Fallback to any hand
      if (!handBone) {
        pitcherMesh.traverse(child => {
          if (child.isBone && !handBone) {
            const name = child.name.toLowerCase();
            if (name.includes('hand') || name.includes('wrist')) {
              handBone = child;
            }
          }
        });
      }
      
      return handBone;
    }
    
    launchFromHand(location, velocity) {
      const ball = window.gc.nodes.ball;
      const pitcher = window.gc.nodes.pitcher;
      const pitcherMesh = window.gc.nodes.pitcherMesh;
      
      if (!ball || !pitcher) {
        console.warn('[Enhancement] Missing ball or pitcher');
        return;
      }
      
      // Find hand bone or use fallback
      const handBone = this.findHandBone(pitcherMesh);
      let startPos;
      
      if (handBone) {
        handBone.updateMatrixWorld(true);
        startPos = new this.THREE.Vector3();
        handBone.getWorldPosition(startPos);
        console.log('[Enhancement] Using hand bone release point:', handBone.name);
      } else {
        startPos = pitcher.position.clone().add(new this.THREE.Vector3(0.3, 1.8, 0.5));
        console.log('[Enhancement] Using fallback release point');
      }
      
      // Set ball position
      ball.position.copy(startPos);
      
      // Calculate target position from MLB coordinates
      const platePos = window.gc.anchors?.plate ? 
        new this.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
        new this.THREE.Vector3(0, 0, 0);
      
      const targetPos = platePos.clone();
      targetPos.x += location.x || 0;      // MLB x coordinate
      targetPos.y = location.z || 2.0;     // MLB z becomes height
      targetPos.z += 0.2;                  // Slightly in front of plate
      
      // Calculate realistic velocity
      const direction = targetPos.clone().sub(startPos);
      const distance = direction.length();
      direction.normalize();
      
      // Convert mph to reasonable 3D velocity
      const speed = (velocity || 95) * 0.015; // Adjusted for your scale
      
      this.velocity.copy(direction.multiplyScalar(speed));
      this.velocity.y += 0.01; // Add slight upward arc
      
      this.active = true;
      
      // Clear and start trail
      this.trail = [startPos.clone()];
      this.updateTrail();
      
      console.log('[Enhancement] Ball launched:', {
        velocity: velocity + ' mph',
        location: `(${location.x?.toFixed(2)}, ${location.z?.toFixed(2)})`,
        distance: distance.toFixed(2)
      });
    }
    
    update(deltaTime) {
      if (!this.active) return;
      
      const ball = window.gc.nodes.ball;
      if (!ball) return;
      
      // Apply gravity
      this.velocity.y -= 9.81 * deltaTime * 0.2; // Gentler gravity
      
      // Update position
      const deltaPos = this.velocity.clone().multiplyScalar(deltaTime);
      ball.position.add(deltaPos);
      
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
        
        if (this.velocity.length() < 0.5) {
          this.active = false;
          console.log('[Enhancement] Ball stopped on ground');
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
      console.log('[Enhancement] Ball physics reset');
    }
  }
  
  // Simple game state
  class SimpleGameState {
    constructor() {
      this.heatData = Array(3).fill(null).map(() => Array(3).fill(0));
      this.pitches = [];
    }
    
    addPitch(x, z, velocity) {
      // Convert MLB coordinates to 3x3 grid
      const col = Math.floor(((x + 0.83) / 1.66) * 3);
      const row = Math.floor(((3.5 - z) / 2.0) * 3);
      
      // Clamp to grid
      const gridCol = Math.max(0, Math.min(2, col));
      const gridRow = Math.max(0, Math.min(2, row));
      
      this.heatData[gridRow][gridCol]++;
      
      // Update your existing heat map
      if (window.heat) {
        window.heat[gridRow][gridCol] = this.heatData[gridRow][gridCol];
        if (window.drawZone) {
          window.drawZone();
        }
      }
      
      this.pitches.push({ x, z, velocity, time: Date.now() });
      console.log('[Enhancement] Added pitch to heat map:', { 
        x: x.toFixed(2), 
        z: z.toFixed(2), 
        velocity, 
        grid: `[${gridRow},${gridCol}]` 
      });
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
      this.heatData = Array(3).fill(null).map(() => Array(3).fill(0));
      this.pitches = [];
      
      if (window.heat) {
        window.heat.forEach(row => row.fill(0));
        if (window.drawZone) {
          window.drawZone();
        }
      }
      
      console.log('[Enhancement] Game state cleared');
    }
  }
  
  function initializeEnhancements() {
    if (initialized) return;
    
    try {
      console.log('[Enhancement] Initializing with THREE:', !!window.gc.THREE);
      
      // Initialize systems
      ballPhysics = new SimpleBallPhysics();
      gameState = new SimpleGameState();
      
      // Hook into existing game events
      document.addEventListener('gc:play', handleGameEvent);
      
      // FIXED: Check if animate function exists before enhancing
      if (typeof window.animate === 'function') {
        enhanceAnimationLoop();
      } else {
        console.warn('[Enhancement] No animate function found, skipping animation enhancement');
      }
      
      // Add controls
      addEnhancementControls();
      
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
      
      initialized = true;
      console.log('[Enhancement] ✅ FIXED Simple enhancements initialized successfully');
      
    } catch (error) {
      console.error('[Enhancement] ❌ Failed to initialize:', error);
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
    if (!originalAnimate) {
      console.warn('[Enhancement] No existing animate function found');
      return;
    }
    
    // Replace with enhanced version
    window.animate = function() {
      // Call original first
      originalAnimate();
      
      // Add enhanced physics
      if (ballPhysics) {
        const deltaTime = window.gc.clock?.getDelta() || 0.016;
        ballPhysics.update(deltaTime);
      }
    };
    
    console.log('[Enhancement] Animation loop enhanced successfully');
  }
  
  function addEnhancementControls() {
    // Enhanced pitch button
    const enhancedBtn = document.createElement('button');
    enhancedBtn.textContent = '⚡ Enhanced Pitch';
    enhancedBtn.style.cssText = `
      position: absolute; bottom: 140px; left: 10px;
      padding: 8px 12px; background: #ff6600; color: white;
      border: none; border-radius: 5px; cursor: pointer;
      font-weight: bold; z-index: 1000;
    `;
    enhancedBtn.onclick = testEnhancedPitch;
    document.body.appendChild(enhancedBtn);
    
    // Clear enhanced button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🧹 Clear Enhanced';
    clearBtn.style.cssText = `
      position: absolute; bottom: 100px; left: 10px;
      padding: 8px 12px; background: #cc0066; color: white;
      border: none; border-radius: 5px; cursor: pointer;
      font-weight: bold; z-index: 1000;
    `;
    clearBtn.onclick = () => {
      ballPhysics.reset();
      gameState.clear();
    };
    document.body.appendChild(clearBtn);
    
    // Stats display
    const statsDiv = document.createElement('div');
    statsDiv.id = 'enhancedStats';
    statsDiv.style.cssText = `
      position: absolute; top: 250px; left: 10px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px; border-radius: 8px; font-size: 12px;
      font-family: monospace; min-width: 200px;
      border: 1px solid rgba(255,255,255,0.3); z-index: 1000;
    `;
    document.body.appendChild(statsDiv);
    
    // Update stats display
    setInterval(updateStatsDisplay, 1000);
    
    console.log('[Enhancement] Controls added');
  }
  
  function testEnhancedPitch() {
    if (!ballPhysics || !gameState) {
      console.warn('[Enhancement] Systems not ready');
      return;
    }
    
    // Generate realistic pitch location and velocity
    const location = {
      x: (Math.random() - 0.5) * 1.4,  // Strike zone width
      z: 1.8 + Math.random() * 1.4     // Strike zone height
    };
    const velocity = 88 + Math.random() * 12; // 88-100 mph
    
    ballPhysics.launchFromHand(location, velocity);
    gameState.addPitch(location.x, location.z, velocity);
  }
  
  function updateStatsDisplay() {
    const statsDiv = document.getElementById('enhancedStats');
    if (!statsDiv || !gameState) return;
    
    const stats = gameState.getStats();
    
    statsDiv.innerHTML = `
      <div style="color: #ffaa00; font-weight: bold; margin-bottom: 8px;">⚡ Enhanced Ball Tracking</div>
      <div>Total Pitches: ${stats.total}</div>
      <div>Avg Velocity: ${stats.avgVelocity} mph</div>
      <div>Ball Active: ${ballPhysics?.active ? 'Yes' : 'No'}</div>
      <div>Hand Tracking: ${initialized ? 'Active' : 'Loading...'}</div>
      <div style="margin-top: 8px; font-size: 10px; opacity: 0.7;">
        FIXED: Ball launches from pitcher's hand bone
      </div>
    `;
  }
  
  // FIXED: Better initialization timing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForGameCast);
  } else {
    waitForGameCast();
  }
  
  // FIXED: Also listen for your gc:ready event
  document.addEventListener('gc:ready', () => {
    setTimeout(waitForGameCast, 500);
  });
  
})();