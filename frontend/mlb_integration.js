// mlbIntegration.js - SYNTAX ERRORS FIXED
// Integration layer for live MLB data and enhanced ball physics
// Fixed all syntax errors and missing statements

(function() {
  'use strict';
  
  console.log('[MLBIntegration] Loading syntax-fixed MLB integration...');
  
  // Enhanced Ball Physics class
  class EnhancedBallPhysics {
    constructor(scene, gameState) {
      this.scene = scene;
      this.gameState = gameState;
      this.THREE = window.gc.THREE;
      
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
        velocity: new this.THREE.Vector3(),
        position: new this.THREE.Vector3(),
        startTime: 0,
        pitch: null
      };
      
      this.initializeTrail();
      console.log('[BallPhysics] Enhanced ball physics initialized');
    }
    
    initializeTrail() {
      const maxPoints = this.trail.maxPoints;
      
      this.trail.geometry = new this.THREE.BufferGeometry();
      this.trail.positions = new Float32Array(maxPoints * 3);
      this.trail.colors = new Float32Array(maxPoints * 3);
      
      this.trail.geometry.setAttribute('position', new this.THREE.BufferAttribute(this.trail.positions, 3));
      this.trail.geometry.setAttribute('color', new this.THREE.BufferAttribute(this.trail.colors, 3));
      this.trail.geometry.setDrawRange(0, 0);
      
      this.trail.material = new this.THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        linewidth: 3
      });
      
      this.trail.line = new this.THREE.Line(this.trail.geometry, this.trail.material);
      this.scene.add(this.trail.line);
    }
    
    findPitcherHandBone(pitcherMesh) {
      let handBone = null;
      
      if (!pitcherMesh) return null;
      
      pitcherMesh.traverse(child => {
        if (child.isBone && !handBone) {
          const name = child.name.toLowerCase();
          
          const isHand = name.includes('hand') || name.includes('wrist') || name.includes('palm');
          const isRight = name.includes('right') || name.includes('r_') || name.includes('_r');
          
          if (isHand && isRight) {
            handBone = child;
          }
        }
      });
      
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
      const handBone = this.findPitcherHandBone(pitcherMesh);
      
      if (handBone) {
        handBone.updateMatrixWorld(true);
        const handPos = new this.THREE.Vector3();
        handBone.getWorldPosition(handPos);
        
        console.log('[BallPhysics] Using hand bone for release point');
        return handPos;
      }
      
      const pitcherPos = pitcher.position.clone();
      pitcherPos.add(new this.THREE.Vector3(0.3, 1.8, 0.5));
      
      console.log('[BallPhysics] Using fallback release point');
      return pitcherPos;
    }
    
    launchBall(pitchData, ball, pitcher, pitcherMesh) {
      const { location, velocity, pitchType, outcome } = pitchData;
      
      const releasePoint = this.calculateReleasePoint(pitcher, pitcherMesh);
      const targetPoint = this.convertMLBToWorld(location, ball);
      const trajectory = this.calculateTrajectory(releasePoint, targetPoint, velocity);
      
      this.ballState = {
        active: true,
        velocity: trajectory.velocity.clone(),
        position: releasePoint.clone(),
        startTime: performance.now(),
        pitch: pitchData
      };
      
      ball.position.copy(releasePoint);
      ball.userData.enhancedPhysics = true;
      
      this.clearTrail();
      this.addTrailPoint(releasePoint, velocity);
      
      console.log('[BallPhysics] Ball launched:', {
        pitchType,
        velocity: velocity + ' mph',
        location: `(${location.x.toFixed(2)}, ${location.z.toFixed(2)})`,
        releasePoint: releasePoint.toArray().map(n => n.toFixed(2))
      });
      
      if (this.gameState && this.gameState.onBallLaunched) {
        this.gameState.onBallLaunched(pitchData, releasePoint, targetPoint);
      }
    }
    
    convertMLBToWorld(location, ball) {
      const platePos = window.gc && window.gc.anchors && window.gc.anchors.plate ? 
        new this.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
        new this.THREE.Vector3(0, 0, 0);
      
      const worldTarget = platePos.clone();
      worldTarget.x += location.x;
      worldTarget.y = location.z;
      worldTarget.z += 0.2;
      
      return worldTarget;
    }
    
    calculateTrajectory(start, target, velocityMph) {
      const velocityMs = velocityMph * 0.44704;
      
      const direction = target.clone().sub(start);
      const distance = direction.length();
      direction.normalize();
      
      const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z) * distance;
      const flightTime = horizontalDistance / (velocityMs * 0.9);
      
      const gravity = this.physics.gravity;
      const deltaY = target.y - start.y;
      
      const vy = (deltaY - 0.5 * gravity * flightTime * flightTime) / flightTime;
      
      const horizontalSpeed = velocityMs * 0.9;
      const vx = direction.x * horizontalSpeed;
      const vz = direction.z * horizontalSpeed;
      
      return {
        velocity: new this.THREE.Vector3(vx, vy, vz),
        flightTime: flightTime
      };
    }
    
    updatePhysics(deltaTime, ball) {
      if (!this.ballState.active || !ball.userData.enhancedPhysics) return;
      
      const velocity = this.ballState.velocity;
      
      velocity.y += this.physics.gravity * deltaTime;
      velocity.multiplyScalar(this.physics.airResistance);
      
      const deltaPos = velocity.clone().multiplyScalar(deltaTime);
      this.ballState.position.add(deltaPos);
      ball.position.copy(this.ballState.position);
      
      const speed = velocity.length() * 2.237;
      this.addTrailPoint(ball.position, speed);
      
      this.checkCollisions(ball);
    }
    
    checkCollisions(ball) {
      const pos = this.ballState.position;
      const vel = this.ballState.velocity;
      
      if (pos.y <= 0.05) {
        pos.y = 0.05;
        vel.y = Math.abs(vel.y) * this.physics.groundRestitution;
        vel.x *= this.physics.groundFriction;
        vel.z *= this.physics.groundFriction;
        
        if (vel.length() < 2.0) {
          this.stopBall();
        }
      }
      
      if (this.ballState.pitch && !this.ballState.pitch.registered) {
        const platePos = window.gc && window.gc.anchors && window.gc.anchors.plate ? 
          new this.THREE.Vector3().setFromMatrixPosition(window.gc.anchors.plate.matrixWorld) :
          new this.THREE.Vector3(0, 0, 0);
        
        if (Math.abs(pos.z - platePos.z) < 0.5) {
          this.registerPitchLocation();
        }
      }
    }
    
    registerPitchLocation() {
      if (!this.ballState.pitch || this.ballState.pitch.registered) return;
      
      const pitch = this.ballState.pitch;
      pitch.registered = true;
      
      if (this.gameState && this.gameState.onPitchRegistered) {
        this.gameState.onPitchRegistered(pitch, this.ballState.position.clone());
      }
      
      console.log('[BallPhysics] Pitch registered in strike zone:', pitch.pitchType);
    }
    
    addTrailPoint(position, velocityMph) {
      const { positions, colors, maxPoints } = this.trail;
      let { currentPoints } = this.trail;
      
      if (currentPoints >= maxPoints) {
        positions.copyWithin(0, 3, maxPoints * 3);
        colors.copyWithin(0, 3, maxPoints * 3);
        currentPoints = maxPoints - 1;
      }
      
      positions.set([position.x, position.y, position.z], currentPoints * 3);
      
      const normalizedSpeed = Math.min(Math.max((velocityMph - 70) / 40, 0), 1);
      const r = normalizedSpeed;
      const g = 0.2;
      const b = 1 - normalizedSpeed;
      colors.set([r, g, b], currentPoints * 3);
      
      this.trail.currentPoints = currentPoints + 1;
      
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
      
      if (window.gc && window.gc.nodes && window.gc.nodes.ball) {
        window.gc.nodes.ball.userData.enhancedPhysics = false;
      }
      
      console.log('[BallPhysics] Ball stopped');
    }
    
    resetBall(ball, pitcher) {
      this.stopBall();
      
      if (ball && pitcher) {
        const resetPos = pitcher.position.clone().add(new this.THREE.Vector3(0, 1.5, 0));
        ball.position.copy(resetPos);
        ball.userData.enhancedPhysics = false;
      }
      
      this.clearTrail();
    }
    
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

  // Enhanced Game State class
  class GameState {
    constructor() {
      this.state = {
        gameId: null,
        inning: 1,
        half: 'top',
        outs: 0,
        count: { balls: 0, strikes: 0 },
        
        batter: {
          id: null,
          name: 'Demo Batter',
          hand: 'R',
          stats: { avg: 0, hr: 0, rbi: 0 }
        },
        
        pitcher: {
          id: null,
          name: 'Demo Pitcher',
          stats: { era: 0, k: 0, bb: 0 }
        },
        
        heatMap: {
          grid: Array(3).fill(null).map(() => Array(3).fill(0)),
          pitches: [],
          bounds: {
            left: -0.83,
            right: 0.83,
            bottom: 1.5,
            top: 3.5
          }
        },
        
        atBat: {
          pitchCount: 0,
          outcome: null,
          sequence: []
        }
      };
      
      this.listeners = new Map();
      this.ballPhysics = null;
      
      console.log('[GameState] Enhanced game state initialized');
    }
    
    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
    }
    
    emit(event, data) {
      if (this.listeners.has(event)) {
        this.listeners.get(event).forEach(callback => callback(data));
      }
    }
    
    updateGameSituation(gameData) {
      const { gameId, inning, half, outs, count } = gameData;
      
      const changed = {
        gameId: this.state.gameId !== gameId,
        inning: this.state.inning !== inning || this.state.half !== half,
        outs: this.state.outs !== outs,
        count: this.state.count.balls !== (count && count.balls) || this.state.count.strikes !== (count && count.strikes)
      };
      
      if (gameId) this.state.gameId = gameId;
      if (inning) this.state.inning = inning;
      if (half) this.state.half = half;
      if (typeof outs === 'number') this.state.outs = outs;
      if (count) this.state.count = { ...count };
      
      if (changed.inning) this.emit('inning:changed', { inning, half });
      if (changed.outs) this.emit('outs:changed', outs);
      if (changed.count) this.emit('count:changed', count);
      
      this.emit('game:updated', this.state);
    }
    
    updateBatter(batterData) {
      const { id, name, hand, stats } = batterData;
      
      const handChanged = this.state.batter.hand !== hand;
      
      Object.assign(this.state.batter, {
        id: id || this.state.batter.id,
        name: name || this.state.batter.name,
        hand: hand || this.state.batter.hand,
        stats: { ...this.state.batter.stats, ...stats }
      });
      
      if (handChanged) {
        this.emit('batter:handChanged', hand);
      }
      
      this.emit('batter:updated', this.state.batter);
    }
    
    updatePitcher(pitcherData) {
      const { id, name, stats } = pitcherData;
      
      Object.assign(this.state.pitcher, {
        id: id || this.state.pitcher.id,
        name: name || this.state.pitcher.name,
        stats: { ...this.state.pitcher.stats, ...stats }
      });
      
      this.emit('pitcher:updated', this.state.pitcher);
    }
    
    processPitch(pitchData) {
      const {
        pitchType = 'Unknown',
        velocity = 0,
        location = { x: 0, z: 0 },
        outcome = '',
        timestamp = Date.now()
      } = pitchData;
      
      const pitch = {
        id: `${this.state.gameId || 'demo'}-${this.state.atBat.pitchCount + 1}`,
        pitchType,
        velocity,
        location,
        outcome,
        timestamp,
        inStrikeZone: this.isInStrikeZone(location.x, location.z),
        inning: this.state.inning,
        half: this.state.half,
        count: { ...this.state.count }
      };
      
      this.state.heatMap.pitches.push(pitch);
      this.state.atBat.sequence.push(pitch);
      this.state.atBat.pitchCount++;
      
      this.updateHeatMapGrid(location.x, location.z);
      
      this.emit('pitch:added', pitch);
      this.emit('heatMap:updated', this.state.heatMap);
      
      console.log('[GameState] Pitch processed:', {
        type: pitchType,
        velocity: velocity + ' mph',
        location: `(${location.x.toFixed(2)}, ${location.z.toFixed(2)})`,
        outcome
      });
      
      return pitch;
    }
    
    updateHeatMapGrid(x, z) {
      const { bounds } = this.state.heatMap;
      
      const col = Math.floor(((x - bounds.left) / (bounds.right - bounds.left)) * 3);
      const row = Math.floor(((bounds.top - z) / (bounds.top - bounds.bottom)) * 3);
      
      const gridCol = Math.max(0, Math.min(2, col));
      const gridRow = Math.max(0, Math.min(2, row));
      
      this.state.heatMap.grid[gridRow][gridCol]++;
    }
    
    isInStrikeZone(x, z) {
      const { bounds } = this.state.heatMap;
      return x >= bounds.left && x <= bounds.right && z >= bounds.bottom && z <= bounds.top;
    }
    
    getPitchStats() {
      const pitches = this.state.heatMap.pitches;
      const total = pitches.length;
      
      if (total === 0) {
        return {
          total: 0,
          strikes: 0,
          balls: 0,
          strikePercentage: 0,
          avgVelocity: 0,
          pitchTypes: {}
        };
      }
      
      const strikes = pitches.filter(p => p.inStrikeZone).length;
      const balls = total - strikes;
      const avgVelocity = pitches.reduce((sum, p) => sum + p.velocity, 0) / total;
      
      const pitchTypes = {};
      pitches.forEach(p => {
        pitchTypes[p.pitchType] = (pitchTypes[p.pitchType] || 0) + 1;
      });
      
      return {
        total,
        strikes,
        balls,
        strikePercentage: Math.round((strikes / total) * 100),
        avgVelocity: Math.round(avgVelocity * 10) / 10,
        pitchTypes
      };
    }
    
    getCurrentGameState() {
      return {
        situation: {
          inning: this.state.inning,
          half: this.state.half,
          outs: this.state.outs,
          count: { ...this.state.count }
        },
        players: {
          batter: { ...this.state.batter },
          pitcher: { ...this.state.pitcher }
        },
        atBat: { ...this.state.atBat },
        stats: this.getPitchStats()
      };
    }
    
    onBallLaunched(pitchData, releasePoint, targetPoint) {
      console.log('[GameState] Ball launched from release point:', {
        pitch: pitchData.pitchType,
        release: releasePoint.toArray().map(n => n.toFixed(2)),
        target: targetPoint.toArray().map(n => n.toFixed(2))
      });
      
      this.emit('ball:launched', { pitchData, releasePoint, targetPoint });
    }
    
    onPitchRegistered(pitch, actualLocation) {
      console.log('[GameState] Pitch registered at actual location:', {
        intended: `(${pitch.location.x.toFixed(2)}, ${pitch.location.z.toFixed(2)})`,
        actual: actualLocation.toArray().map(n => n.toFixed(2))
      });
      
      this.emit('pitch:registered', { pitch, actualLocation });
    }
    
    setBallPhysics(ballPhysics) {
      this.ballPhysics = ballPhysics;
    }
    
    clearHeatMap() {
      this.state.heatMap.grid = Array(3).fill(null).map(() => Array(3).fill(0));
      this.state.heatMap.pitches = [];
      
      this.emit('heatMap:cleared');
      console.log('[GameState] Heat map cleared');
    }
    
    resetGame() {
      this.state.inning = 1;
      this.state.half = 'top';
      this.state.outs = 0;
      this.state.count = { balls: 0, strikes: 0 };
      this.clearHeatMap();
      this.resetAtBat();
      
      this.emit('game:reset');
      console.log('[GameState] Game state reset');
    }
    
    resetAtBat() {
      this.state.atBat = {
        pitchCount: 0,
        outcome: null,
        sequence: []
      };
      
      this.emit('atBat:reset');
    }
  }

  // MLBIntegration main class
  class MLBIntegration {
    constructor() {
      this.gameState = null;
      this.ballPhysics = null;
      this.isInitialized = false;
      
      this.waitForGameCast();
    }
    
    waitForGameCast() {
      document.addEventListener('gc:ready', () => {
        console.log('[MLBIntegration] GameCast ready, initializing enhancements...');
        setTimeout(() => this.initialize(), 1000);
      });
      
      if (window.gc && window.gc.scene) {
        setTimeout(() => this.initialize(), 1000);
      }
    }
    
    initialize() {
      if (this.isInitialized) return;
      
      try {
        this.gameState = new GameState();
        this.ballPhysics = new EnhancedBallPhysics(window.gc.scene, this.gameState);
        this.gameState.setBallPhysics(this.ballPhysics);
        
        this.integrateWithExistingSystem();
        this.setupEventListeners();
        
        window.gc.enhanced = {
          gameState: this.gameState,
          ballPhysics: this.ballPhysics,
          integration: this
        };
        
        this.isInitialized = true;
        console.log('[MLBIntegration] ✅ Enhanced systems initialized successfully (syntax fixed)');
        
      } catch (error) {
        console.error('[MLBIntegration] ❌ Failed to initialize:', error);
      }
    }
    
    integrateWithExistingSystem() {
      document.addEventListener('gc:play', (event) => {
        this.handleGameEvent(event.detail);
      });
      
      this.enhanceAnimationLoop();
      this.addEnhancedControls();
      
      console.log('[MLBIntegration] Integrated with existing GameCast system');
    }
    
    handleGameEvent(eventDetail) {
      const { type, desc } = eventDetail;
      
      const pitchData = this.parseEventData(eventDetail);
      const pitch = this.gameState.processPitch(pitchData);
      
      if (type === 'PITCH' && window.gc.nodes && window.gc.nodes.ball && window.gc.nodes.pitcher) {
        this.launchEnhancedBall(pitch);
      }
      
      console.log('[MLBIntegration] Handled game event:', type);
    }
    
    parseEventData(eventDetail) {
      const { type, desc = '' } = eventDetail;
      
      const locationMatch = desc.match(/\[([-\d.]+)\s*,\s*([-\d.]+)\]/);
      const velocityMatch = desc.match(/(\d+)/);
      const pitchTypeMatch = desc.match(/^(\w+)/);
      
      return {
        pitchType: (pitchTypeMatch && pitchTypeMatch[1]) || 'Fastball',
        velocity: velocityMatch ? parseInt(velocityMatch[1]) : 88 + Math.random() * 12,
        location: {
          x: locationMatch ? parseFloat(locationMatch[1]) : (Math.random() - 0.5) * 1.6,
          z: locationMatch ? parseFloat(locationMatch[2]) : 1.5 + Math.random() * 2
        },
        outcome: this.mapEventTypeToOutcome(type),
        timestamp: Date.now()
      };
    }
    
    mapEventTypeToOutcome(eventType) {
      const outcomeMap = {
        'PITCH': 'Strike',
        'STRIKE': 'Strike',
        'SWING': 'Swing',
        'FOUL': 'Foul',
        'CONTACT': 'Contact',
        'INPLAY': 'In Play',
        'WALK': 'Ball',
        'STRIKEOUT': 'Strikeout'
      };
      
      return outcomeMap[eventType] || 'Unknown';
    }
    
    launchEnhancedBall(pitchData) {
      const ball = window.gc.nodes.ball;
      const pitcher = window.gc.nodes.pitcher;
      const pitcherMesh = window.gc.nodes.pitcherMesh;
      
      if (!ball || !pitcher) {
        console.warn('[MLBIntegration] Missing ball or pitcher for enhanced launch');
        return;
      }
      
      this.ballPhysics.launchBall(pitchData, ball, pitcher, pitcherMesh);
    }
    
    enhanceAnimationLoop() {
      const originalAnimate = window.animate;
      if (!originalAnimate) return;
      
      window.animate = () => {
        if (typeof originalAnimate === 'function') {
          originalAnimate();
        }
        
        if (this.ballPhysics && window.gc.nodes && window.gc.nodes.ball) {
          const deltaTime = (window.gc.clock && window.gc.clock.getDelta) ? window.gc.clock.getDelta() : 0.016;
          this.ballPhysics.updatePhysics(deltaTime, window.gc.nodes.ball);
        }
      };
      
      console.log('[MLBIntegration] Enhanced animation loop');
    }
    
    addEnhancedControls() {
      // Enhanced test button
      const enhancedTestBtn = document.createElement('button');
      enhancedTestBtn.textContent = '🚀 MLB Enhanced Pitch';
      enhancedTestBtn.style.cssText = `
        position: absolute; bottom: 60px; right: 10px;
        padding: 8px 12px; background: #00aa44; color: white;
        border: none; border-radius: 5px; cursor: pointer;
        font-weight: bold; z-index: 1000;
      `;
      enhancedTestBtn.onclick = () => this.testEnhancedPitch();
      document.body.appendChild(enhancedTestBtn);
      
      // Add enhanced info display
      this.addEnhancedInfoDisplay();
    }
    
    addEnhancedInfoDisplay() {
      const infoPanel = document.createElement('div');
      infoPanel.id = 'mlbEnhancedInfo';
      infoPanel.style.cssText = `
        position: absolute; top: 80px; right: 20px;
        background: rgba(0,0,0,0.85); color: white;
        padding: 12px; border-radius: 8px; font-size: 12px;
        font-family: monospace; min-width: 220px;
        border: 1px solid rgba(0,170,68,0.5); z-index: 1000;
      `;
      document.body.appendChild(infoPanel);
      
      setInterval(() => {
        const stats = this.gameState.getPitchStats();
        const gameState = this.gameState.getCurrentGameState();
        
        infoPanel.innerHTML = `
          <div style="color: #00aa44; font-weight: bold; margin-bottom: 8px;">🚀 MLB Enhanced (Fixed)</div>
          <div>Total Pitches: ${stats.total}</div>
          <div>Strike %: ${stats.strikePercentage}%</div>
          <div>Avg Velocity: ${stats.avgVelocity} mph</div>
          <div style="margin-top: 8px;">
            <strong>Game:</strong> ${gameState.situation.half} ${gameState.situation.inning}
          </div>
          <div><strong>Count:</strong> ${gameState.situation.count.balls}-${gameState.situation.count.strikes}</div>
          <div><strong>Ball Active:</strong> ${this.ballPhysics && this.ballPhysics.isActive ? (this.ballPhysics.isActive() ? 'Yes' : 'No') : 'No'}</div>
        `;
      }, 1000);
    }
    
    setupEventListeners() {
      this.gameState.on('pitch:added', (pitch) => {
        console.log('[MLBIntegration] Pitch added to enhanced game state:', pitch.pitchType);
      });
      
      this.gameState.on('heatMap:updated', (heatMapData) => {
        this.updateExistingHeatMap(heatMapData);
      });
      
      this.gameState.on('batter:handChanged', (hand) => {
        if (window.gc.state) {
          window.gc.state.batterHand = hand;
        }
        
        if (window.gc.resnap) {
          window.gc.resnap();
        }
      });
      
      console.log('[MLBIntegration] Event listeners set up');
    }
    
    updateExistingHeatMap(heatMapData) {
      if (window.heat && Array.isArray(window.heat)) {
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (window.heat[r] && window.heat[r][c] !== undefined) {
              window.heat[r][c] = heatMapData.grid[r][c];
            }
          }
        }
        
        if (window.drawZone) {
          window.drawZone();
        }
      }
    }
    
    testEnhancedPitch() {
      const testPitch = {
        pitchType: ['Fastball', 'Slider', 'Curveball', 'Changeup', 'Cutter'][Math.floor(Math.random() * 5)],
        velocity: 88 + Math.random() * 12,
        location: {
          x: (Math.random() - 0.5) * 1.4,
          z: 1.8 + Math.random() * 1.4
        },
        outcome: 'Strike'
      };
      
      const pitch = this.gameState.processPitch(testPitch);
      
      if (window.gc.nodes && window.gc.nodes.ball && window.gc.nodes.pitcher) {
        this.launchEnhancedBall(pitch);
      }
    }
    
    processMLBPitchData(mlbData) {
      const pitchInfo = mlbData.pitch || {};
      const batter = mlbData.batter || {};
      const pitcher = mlbData.pitcher || {};
      const count = mlbData.count || {};
      const coordinates = pitchInfo.coordinates || {};
      
      this.gameState.updateGameSituation({
        inning: mlbData.inning,
        half: mlbData.half,
        outs: mlbData.outs,
        count: count
      });
      
      if (batter.id) {
        this.gameState.updateBatter({
          id: batter.id,
          name: batter.name,
          hand: batter.batSide
        });
      }
      
      if (pitcher.id) {
        this.gameState.updatePitcher({
          id: pitcher.id,
          name: pitcher.name
        });
      }
      
      const pitchData = {
        pitchType: pitchInfo.type || 'Unknown',
        velocity: pitchInfo.mph || 90,
        location: { x: coordinates.pX || 0, z: coordinates.pZ || 2.5 },
        outcome: pitchInfo.outcome || 'Strike'
      };
      
      const pitch = this.gameState.processPitch(pitchData);
      
      if (window.gc.nodes && window.gc.nodes.ball && window.gc.nodes.pitcher) {
        this.launchEnhancedBall(pitch);
      }
      
      console.log('[MLBIntegration] Processed MLB pitch data:', pitchData);
    }
    
    getBallStatus() {
      return {
        isEnhanced: this.ballPhysics && this.ballPhysics.isActive ? this.ballPhysics.isActive() : false,
        currentPitch: this.ballPhysics && this.ballPhysics.getCurrentPitch ? this.ballPhysics.getCurrentPitch() : null,
        trailData: this.ballPhysics && this.ballPhysics.getTrailData ? this.ballPhysics.getTrailData() : null
      };
    }
    
    resetEnhancedSystems() {
      if (this.ballPhysics && window.gc.nodes && window.gc.nodes.ball && window.gc.nodes.pitcher) {
        this.ballPhysics.resetBall(window.gc.nodes.ball, window.gc.nodes.pitcher);
      }
      
      this.gameState.resetGame();
      
      console.log('[MLBIntegration] Enhanced systems reset');
    }
    
    debugInfo() {
      console.log('[MLBIntegration] Debug Info:', {
        initialized: this.isInitialized,
        gameState: !!this.gameState,
        ballPhysics: !!this.ballPhysics,
        gcReady: !!(window.gc && window.gc.scene),
        ballStatus: this.getBallStatus()
      });
    }
  }

  // Auto-initialize when script loads
  const mlbIntegration = new MLBIntegration();

  // Export for global access
  window.MLBIntegration = MLBIntegration;
  window.mlbIntegration = mlbIntegration;

  console.log('[MLBIntegration] ✅ Syntax-fixed MLB integration loaded successfully');

})();