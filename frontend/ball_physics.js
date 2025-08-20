// ballPhysics.js - Enhanced ball physics with pitcher hand release and velocity-based trails
// Layers on top of existing system without breaking anything

import * as THREE from 'three';

export class EnhancedBallPhysics {
  constructor(scene, gameState) {
    this.scene = scene;
    this.gameState = gameState;
    
    // Physics settings
    this.physics = {
      gravity: -9.81,
      airResistance: 0.998,
      groundRestitution: 0.4,
      groundFriction: 0.8
    };
    
    // Trail settings
    this.trail = {
      maxPoints: 200,
      geometry: null,
      material: null,
      line: null,
      positions: null,
      colors: null,
      currentPoints: 0
    };
    
    // Ball state
    this.ballState = {
      active: false,
      velocity: new THREE.Vector3(),
      position: new THREE.Vector3(),
      startTime: 0,
      pitch: null
    };
    
    this.initializeTrail();
    console.log('[BallPhysics] Enhanced ball physics initialized');
  }
  
  initializeTrail() {
    // Create enhanced trail with velocity-based colors
    const maxPoints = this.trail.maxPoints;
    
    this.trail.geometry = new THREE.BufferGeometry();
    this.trail.positions = new Float32Array(maxPoints * 3);
    this.trail.colors = new Float32Array(maxPoints * 3);
    
    this.trail.geometry.setAttribute('position', new THREE.BufferAttribute(this.trail.positions, 3));
    this.trail.geometry.setAttribute('color', new THREE.BufferAttribute(this.trail.colors, 3));
    this.trail.geometry.setDrawRange(0, 0);
    
    this.trail.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      linewidth: 3
    });
    
    this.trail.line = new THREE.Line(this.trail.geometry, this.trail.material);
    this.scene.add(this.trail.line);
  }
  
  findPitcherHandBone(pitcherMesh) {
    // Find the pitcher's throwing hand bone
    let handBone = null;
    
    if (!pitcherMesh) return null;
    
    pitcherMesh.traverse(child => {
      if (child.isBone && !handBone) {
        const name = child.name.toLowerCase();
        
        // Look for right hand bones (throwing hand)
        const isHand = name.includes('hand') || name.includes('wrist') || name.includes('palm');
        const isRight = name.includes('right') || name.includes('r_') || name.includes('_r');
        
        if (isHand && isRight) {
          handBone = child;
        }
      }
    });
    
    // Fallback: look for any hand bone
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
  
  calculateReleasePoint(pitcher, pitcherMesh) {
    // Try to find the pitcher's hand bone first
    const handBone = this.findPitcherHandBone(pitcherMesh);
    
    if (handBone) {
      handBone.updateMatrixWorld(true);
      const handPos = new THREE.Vector3();
      handBone.getWorldPosition(handPos);
      
      console.log('[BallPhysics] Using hand bone for release point');
      return handPos;
    }
    
    // Fallback to pitcher position with realistic offset
    const pitcherPos = pitcher.position.clone();
    
    // Add realistic release point offset (right-handed pitcher)
    pitcherPos.add(new THREE.Vector3(
      0.3,  // Slightly to pitcher's right
      1.8,  // Shoulder height
      0.5   // In front of body
    ));
    
    console.log('[BallPhysics] Using fallback release point');
    return pitcherPos;
  }
  
  launchBall(pitchData, ball, pitcher, pitcherMesh) {
    const { location, velocity, pitchType, outcome } = pitchData;
    
    // Get release point from pitcher's hand
    const releasePoint = this.calculateReleasePoint(pitcher, pitcherMesh);
    
    // Convert MLB coordinates to 3D world coordinates
    const targetPoint = this.convertMLBToWorld(location, ball);
    
    // Calculate realistic trajectory
    const trajectory = this.calculateTrajectory(releasePoint, targetPoint, velocity);
    
    // Initialize ball state
    this.ballState = {
      active: true,
      velocity: trajectory.velocity.clone(),
      position: releasePoint.clone(),
      startTime: performance.now(),
      pitch: pitchData
    };
    
    // Position ball at release point
    ball.position.copy(releasePoint);
    ball.userData.enhancedPhysics = true;
    
    // Clear and start trail
    this.clearTrail();
    this.addTrailPoint(releasePoint, velocity);
    
    console.log('[BallPhysics] Ball launched:', {
      pitchType,
      velocity: velocity + ' mph',
      location: `(${location.x.toFixed(2)}, ${location.z.toFixed(2)})`,
      releasePoint: releasePoint.toArray().map(n => n.toFixed(2))
    });
    
    // Emit event for game state
    this.gameState?.onBallLaunched?.(pitchData, releasePoint, targetPoint);
  }
  
  convertMLBToWorld(location, ball) {
    // Convert MLB strike zone coordinates to world space
    // MLB: x = -0.83 to 0.83 (left to right), z = 1.5 to 3.5 (bottom to top)
    
    // Get home plate position as reference
    const platePos = window.gc?.anchors?.plate ? 
      new THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
      new THREE.Vector3(0, 0, 0);
    
    // Convert to world coordinates
    const worldTarget = platePos.clone();
    worldTarget.x += location.x; // MLB x maps directly to world x
    worldTarget.y = location.z;  // MLB z becomes world y (height)
    worldTarget.z += 0.2;        // Slightly in front of plate
    
    return worldTarget;
  }
  
  calculateTrajectory(start, target, velocityMph) {
    // Convert mph to m/s
    const velocityMs = velocityMph * 0.44704;
    
    // Calculate direction and distance
    const direction = target.clone().sub(start);
    const distance = direction.length();
    direction.normalize();
    
    // Calculate flight time (simplified)
    const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z) * distance;
    const flightTime = horizontalDistance / (velocityMs * 0.9); // Account for air resistance
    
    // Calculate initial velocity components
    const gravity = this.physics.gravity;
    const deltaY = target.y - start.y;
    
    // Vertical velocity component (accounting for gravity)
    const vy = (deltaY - 0.5 * gravity * flightTime * flightTime) / flightTime;
    
    // Horizontal velocity components
    const horizontalSpeed = velocityMs * 0.9; // Reduce for realism
    const vx = direction.x * horizontalSpeed;
    const vz = direction.z * horizontalSpeed;
    
    return {
      velocity: new THREE.Vector3(vx, vy, vz),
      flightTime: flightTime
    };
  }
  
  updatePhysics(deltaTime, ball) {
    if (!this.ballState.active || !ball.userData.enhancedPhysics) return;
    
    const velocity = this.ballState.velocity;
    
    // Apply gravity
    velocity.y += this.physics.gravity * deltaTime;
    
    // Apply air resistance
    velocity.multiplyScalar(this.physics.airResistance);
    
    // Update position
    const deltaPos = velocity.clone().multiplyScalar(deltaTime);
    this.ballState.position.add(deltaPos);
    ball.position.copy(this.ballState.position);
    
    // Add to trail with velocity-based color
    const speed = velocity.length() * 2.237; // Convert to mph for color calculation
    this.addTrailPoint(ball.position, speed);
    
    // Check for collisions
    this.checkCollisions(ball);
  }
  
  checkCollisions(ball) {
    const pos = this.ballState.position;
    const vel = this.ballState.velocity;
    
    // Ground collision
    if (pos.y <= 0.05) {
      pos.y = 0.05;
      vel.y = Math.abs(vel.y) * this.physics.groundRestitution;
      vel.x *= this.physics.groundFriction;
      vel.z *= this.physics.groundFriction;
      
      // Stop if velocity is too low
      if (vel.length() < 2.0) {
        this.stopBall();
      }
    }
    
    // Check if ball reached strike zone (for heat map registration)
    if (this.ballState.pitch && !this.ballState.pitch.registered) {
      const platePos = window.gc?.anchors?.plate ? 
        new THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
        new THREE.Vector3(0, 0, 0);
      
      // Check if ball is near plate Z position
      if (Math.abs(pos.z - platePos.z) < 0.5) {
        this.registerPitchLocation();
      }
    }
  }
  
  registerPitchLocation() {
    if (!this.ballState.pitch || this.ballState.pitch.registered) return;
    
    const pitch = this.ballState.pitch;
    pitch.registered = true;
    
    // Update heat map with pitch location
    this.gameState?.onPitchRegistered?.(pitch, this.ballState.position.clone());
    
    console.log('[BallPhysics] Pitch registered in strike zone:', pitch.pitchType);
  }
  
  addTrailPoint(position, velocityMph) {
    const { positions, colors, maxPoints } = this.trail;
    let { currentPoints } = this.trail;
    
    // Shift array if at capacity
    if (currentPoints >= maxPoints) {
      positions.copyWithin(0, 3, maxPoints * 3);
      colors.copyWithin(0, 3, maxPoints * 3);
      currentPoints = maxPoints - 1;
    }
    
    // Add position
    positions.set([position.x, position.y, position.z], currentPoints * 3);
    
    // Calculate color based on velocity (blue = slow, red = fast)
    const normalizedSpeed = Math.min(Math.max((velocityMph - 70) / 40, 0), 1); // 70-110 mph range
    const r = normalizedSpeed;
    const g = 0.2;
    const b = 1 - normalizedSpeed;
    colors.set([r, g, b], currentPoints * 3);
    
    this.trail.currentPoints = currentPoints + 1;
    
    // Update geometry
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trail.currentPoints);
  }
  
  clearTrail() {
    this.trail.currentPoints = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }
  
  stopBall() {
    this.ballState.active = false;
    
    if (window.gc?.nodes?.ball) {
      window.gc.nodes.ball.userData.enhancedPhysics = false;
    }
    
    console.log('[BallPhysics] Ball stopped');
  }
  
  resetBall(ball, pitcher) {
    this.stopBall();
    
    if (ball && pitcher) {
      // Reset ball to pitcher position
      const resetPos = pitcher.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      ball.position.copy(resetPos);
      ball.userData.enhancedPhysics = false;
    }
    
    this.clearTrail();
  }
  
  // Public API for integration
  isActive() {
    return this.ballState.active;
  }
  
  getCurrentPitch() {
    return this.ballState.pitch;
  }
  
  getTrailData() {
    return {
      points: this.trail.currentPoints,
      maxPoints: this.trail.maxPoints,
      active: this.ballState.active
    };
  }
}