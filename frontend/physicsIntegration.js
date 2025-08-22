// physicsIntegration.js - FINAL FIX
// Properly integrates enhanced physics with existing animation loop

(function() {
  'use strict';
  
  console.log('[PhysicsIntegration] Loading physics integration fix...');
  
  let isIntegrated = false;
  let physicsUpdaters = [];
  
  function waitForGameCast() {
    if (window.gc && window.gc.scene && window.animate && window.ballBatLogic) {
      console.log('[PhysicsIntegration] All systems ready, integrating physics...');
      setTimeout(integratePhysics, 500);
    } else {
      setTimeout(waitForGameCast, 200);
    }
  }
  
  function integratePhysics() {
    if (isIntegrated) return;
    
    try {
      // Store reference to original animate function
      const originalAnimate = window.animate;
      
      // Create enhanced animate function
      window.animate = function() {
        // Call original animation loop first
        originalAnimate();
        
        // Add physics updates
        physicsUpdaters.forEach(updater => {
          try {
            updater();
          } catch (error) {
            console.warn('[PhysicsIntegration] Physics updater error:', error);
          }
        });
      };
      
      // Register ball physics updater
      if (window.ballBatLogic) {
        physicsUpdaters.push(() => {
          updateEnhancedBallPhysics();
        });
      }
      
      // Register animation status updater
      physicsUpdaters.push(() => {
        updateAnimationStatus();
      });
      
      isIntegrated = true;
      console.log('[PhysicsIntegration] ✅ Physics successfully integrated with animation loop');
      
    } catch (error) {
      console.error('[PhysicsIntegration] ❌ Failed to integrate physics:', error);
    }
  }
  
  function updateEnhancedBallPhysics() {
    const ball = window.gc?.nodes?.ball;
    if (!ball || !ball.userData.isEnhanced) return;
    
    const velocity = ball.userData.enhancedVelocity;
    if (!velocity) return;
    
    // Apply gravity
    velocity.y -= 1.2; // Gravity acceleration
    
    // Apply air resistance
    velocity.multiplyScalar(0.998);
    
    // Update position
    const deltaTime = window.gc.clock?.getDelta() || 0.016;
    ball.position.add(velocity.clone().multiplyScalar(deltaTime));
    
    // Add to enhanced trail
    if (window.gc.ballTrail) {
      addEnhancedTrailPoint(ball.position, velocity.length() * 2.237);
    }
    
    // Ground collision
    if (ball.position.y <= 0.5) {
      ball.position.y = 0.5;
      velocity.y = Math.abs(velocity.y) * 0.4;
      velocity.x *= 0.8;
      velocity.z *= 0.8;
      
      if (velocity.length() < 2) {
        ball.userData.isEnhanced = false;
        ball.userData.enhancedVelocity = null;
      }
    }
  }
  
  function addEnhancedTrailPoint(position, velocityMph) {
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
    
    // Calculate color based on velocity
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
  
  function updateAnimationStatus() {
    // Update animation status for UI
    if (window.fixedGameCast && window.gc.mixers) {
      const pitcherActive = window.gc.mixers.pitcher && 
        window.gc.mixers.pitcher._actions.some(action => action.isRunning());
      const batterActive = window.gc.mixers.batter && 
        window.gc.mixers.batter._actions.some(action => action.isRunning());
      
      if (window.fixedGameCast.gameStats) {
        window.fixedGameCast.gameStats.pitcherAnimating = pitcherActive;
        window.fixedGameCast.gameStats.batterAnimating = batterActive;
      }
    }
  }
  
  // Enhanced ball launcher for ballBatLogic
  function enhancedBallLauncher(ballPhysics) {
    const ball = window.gc?.nodes?.ball;
    const pitcher = window.gc?.nodes?.pitcher;
    
    if (!ball || !pitcher) {
      console.warn('[PhysicsIntegration] Missing ball or pitcher for enhanced launch');
      return;
    }
    
    // Find pitcher hand position
    const releasePoint = findPitcherReleasePoint(pitcher);
    
    // Set ball position
    ball.position.copy(releasePoint);
    
    // Calculate target position
    const targetPoint = calculateTargetPosition(ballPhysics.location);
    
    // Calculate velocity
    const trajectory = calculateBallTrajectory(releasePoint, targetPoint, ballPhysics.velocity);
    
    // Set enhanced physics
    ball.userData.isEnhanced = true;
    ball.userData.enhancedVelocity = trajectory.velocity.clone();
    
    // Clear and start trail
    if (window.gc.ballTrail) {
      window.gc.ballTrail.count = 0;
      window.gc.ballTrail.line.geometry.setDrawRange(0, 0);
    }
    
    console.log('[PhysicsIntegration] Enhanced ball launched:', {
      velocity: ballPhysics.velocity + ' mph',
      location: `(${ballPhysics.location.x.toFixed(2)}, ${ballPhysics.location.z.toFixed(2)})`
    });
  }
  
  function findPitcherReleasePoint(pitcher) {
    const pitcherMesh = window.gc.nodes?.pitcherMesh;
    
    if (pitcherMesh) {
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
        return handPos;
      }
    }
    
    // Fallback to pitcher position with offset
    const releasePoint = pitcher.position.clone();
    releasePoint.add(new window.gc.THREE.Vector3(15, 35, 10));
    return releasePoint;
  }
  
  function calculateTargetPosition(location) {
    const platePos = window.gc.anchors?.plate ? 
      new window.gc.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
      new window.gc.THREE.Vector3(0, 0, 0);
    
    const targetPos = platePos.clone();
    targetPos.x += location.x * 50;
    targetPos.y = Math.max(5, location.z * 25);
    targetPos.z += 20;
    
    return targetPos;
  }
  
  function calculateBallTrajectory(start, target, velocityMph) {
    const direction = target.clone().sub(start);
    const distance = direction.length();
    direction.normalize();
    
    const velocityUnitsPerSec = (velocityMph / 95) * 60;
    const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z) * distance;
    const flightTime = horizontalDistance / (velocityUnitsPerSec * 0.8);
    
    const gravity = -30;
    const vy = (target.y - start.y + 0.5 * Math.abs(gravity) * flightTime * flightTime) / flightTime;
    
    const velocity = new window.gc.THREE.Vector3(
      direction.x * velocityUnitsPerSec,
      vy,
      direction.z * velocityUnitsPerSec
    );
    
    return { velocity, flightTime };
  }
  
  // Fix ballBatLogic integration
  function fixBallBatLogic() {
    if (window.ballBatLogic && window.ballBatLogic.launchBall) {
      const originalLaunch = window.ballBatLogic.launchBall;
      
      window.ballBatLogic.launchBall = function(ballPhysics) {
        enhancedBallLauncher(ballPhysics);
      };
      
      console.log('[PhysicsIntegration] ✅ BallBatLogic enhanced launcher integrated');
    }
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
      fixBallBatLogic();
    }, 2000);
  });
  
  // Export for debugging
  window.physicsIntegration = {
    isIntegrated: () => isIntegrated,
    testEnhancedBall: () => enhancedBallLauncher({
      velocity: 95,
      location: { x: 0.1, z: 2.5 }
    }),
    physicsUpdaters: () => physicsUpdaters.length
  };
  
  console.log('[PhysicsIntegration] Physics integration script loaded');
  
})();