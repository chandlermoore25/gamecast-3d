// mlbIntegration.js - Integration layer for live MLB data and enhanced ball physics
// Connects your existing system with enhanced features

import { EnhancedBallPhysics } from './ballPhysics.js';
import { GameState } from './gameState.js';

export class MLBIntegration {
  constructor() {
    this.gameState = null;
    this.ballPhysics = null;
    this.isInitialized = false;
    
    // Wait for your existing system to be ready
    this.waitForGameCast();
  }
  
  waitForGameCast() {
    // Listen for your existing gc:ready event
    document.addEventListener('gc:ready', () => {
      console.log('[MLBIntegration] GameCast ready, initializing enhancements...');
      this.initialize();
    });
    
    // Also check if already ready
    if (window.gc && window.gc.scene) {
      setTimeout(() => this.initialize(), 100);
    }
  }
  
  initialize() {
    if (this.isInitialized) return;
    
    try {
      // Initialize game state
      this.gameState = new GameState();
      
      // Initialize ball physics
      this.ballPhysics = new EnhancedBallPhysics(window.gc.scene, this.gameState);
      
      // Connect game state and ball physics
      this.gameState.setBallPhysics(this.ballPhysics);
      
      // Hook into your existing systems
      this.integrateWithExistingSystem();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Expose to global scope for debugging
      window.gc.enhanced = {
        gameState: this.gameState,
        ballPhysics: this.ballPhysics,
        integration: this
      };
      
      this.isInitialized = true;
      console.log('[MLBIntegration] Enhanced systems initialized successfully');
      
    } catch (error) {
      console.error('[MLBIntegration] Failed to initialize:', error);
    }
  }
  
  integrateWithExistingSystem() {
    // Hook into your existing gc:play event system
    document.addEventListener('gc:play', (event) => {
      this.handleGameEvent(event.detail);
    });
    
    // Enhance your existing animation loop
    this.enhanceAnimationLoop();
    
    // Add enhanced controls
    this.addEnhancedControls();
    
    console.log('[MLBIntegration] Integrated with existing GameCast system');
  }
  
  handleGameEvent(eventDetail) {
    const { type, desc } = eventDetail;
    
    // Extract pitch data from your existing event format
    const pitchData = this.parseEventData(eventDetail);
    
    // Process through game state
    const pitch = this.gameState.processPitch(pitchData);
    
    // Launch enhanced ball physics if it's a pitch
    if (type === 'PITCH' && window.gc.nodes?.ball && window.gc.nodes?.pitcher) {
      this.launchEnhancedBall(pitch);
    }
    
    console.log('[MLBIntegration] Handled game event:', type);
  }
  
  parseEventData(eventDetail) {
    const { type, desc = '' } = eventDetail;
    
    // Extract location from description (your existing format)
    const locationMatch = desc.match(/\[([-\d.]+)\s*,\s*([-\d.]+)\]/);
    const velocityMatch = desc.match(/(\d+)/);
    const pitchTypeMatch = desc.match(/^(\w+)/);
    
    return {
      pitchType: pitchTypeMatch?.[1] || 'Fastball',
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
    
    // Use enhanced ball physics
    this.ballPhysics.launchBall(pitchData, ball, pitcher, pitcherMesh);
  }
  
  enhanceAnimationLoop() {
    // Store reference to your existing animate function
    const originalAnimate = window.animate;
    if (!originalAnimate) return;
    
    // Create enhanced animation loop
    window.animate = () => {
      // Call your original animation loop
      if (typeof originalAnimate === 'function') {
        originalAnimate();
      }
      
      // Add enhanced physics update
      if (this.ballPhysics && window.gc.nodes?.ball) {
        const deltaTime = window.gc.clock?.getDelta() || 0.016;
        this.ballPhysics.updatePhysics(deltaTime, window.gc.nodes.ball);
      }
    };
    
    console.log('[MLBIntegration] Enhanced animation loop');
  }
  
  addEnhancedControls() {
    // Add enhanced test button
    const enhancedTestBtn = document.createElement('button');
    enhancedTestBtn.textContent = '⚡ Enhanced Pitch';
    enhancedTestBtn.style.cssText = `
      position: absolute; bottom: 100px; left: 10px;
      padding: 8px 12px; background: #ff6600; color: white;
      border: none; border-radius: 5px; cursor: pointer;
      font-weight: bold;
    `;
    enhancedTestBtn.onclick = () => this.testEnhancedPitch();
    document.body.appendChild(enhancedTestBtn);
    
    // Add test sequence button
    const sequenceBtn = document.createElement('button');
    sequenceBtn.textContent = '📊 Test Sequence';
    sequenceBtn.style.cssText = `
      position: absolute; bottom: 60px; left: 120px;
      padding: 8px 12px; background: #6600cc; color: white;
      border: none; border-radius: 5px; cursor: pointer;
      font-weight: bold;
    `;
    sequenceBtn.onclick = () => this.gameState.generateTestSequence(5);
    document.body.appendChild(sequenceBtn);
    
    // Add heat map info display
    this.addHeatMapInfo();
  }
  
  addHeatMapInfo() {
    const infoPanel = document.createElement('div');
    infoPanel.id = 'enhancedHeatMapInfo';
    infoPanel.style.cssText = `
      position: absolute; top: 80px; right: 20px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px; border-radius: 8px; font-size: 12px;
      font-family: monospace; min-width: 200px;
      border: 1px solid rgba(255,255,255,0.3);
    `;
    document.body.appendChild(infoPanel);
    
    // Update info periodically
    setInterval(() => {
      const stats = this.gameState.getPitchStats();
      const gameState = this.gameState.getCurrentGameState();
      
      infoPanel.innerHTML = `
        <div style="color: #00ff88; font-weight: bold; margin-bottom: 8px;">⚾ Enhanced Stats</div>
        <div>Total Pitches: ${stats.total}</div>
        <div>Strikes: ${stats.strikes} (${stats.strikePercentage}%)</div>
        <div>Avg Velocity: ${stats.avgVelocity} mph</div>
        <div style="margin-top: 8px;">
          <strong>Game:</strong> ${gameState.situation.half} ${gameState.situation.inning}
        </div>
        <div><strong>Count:</strong> ${gameState.situation.count.balls}-${gameState.situation.count.strikes}</div>
        <div><strong>Outs:</strong> ${gameState.situation.outs}</div>
      `;
    }, 1000);
  }
  
  setupEventListeners() {
    // Listen to game state events
    this.gameState.on('pitch:added', (pitch) => {
      console.log('[MLBIntegration] Pitch added to game state:', pitch.pitchType);
    });
    
    this.gameState.on('heatMap:updated', (heatMapData) => {
      // Update your existing heat map with enhanced data
      this.updateExistingHeatMap(heatMapData);
    });
    
    this.gameState.on('batter:handChanged', (hand) => {
      // Update your existing batter hand state
      if (window.gc.state) {
        window.gc.state.batterHand = hand;
      }
      
      // Trigger your existing repositioning
      if (window.gc.resnap) {
        window.gc.resnap();
      }
    });
    
    console.log('[MLBIntegration] Event listeners set up');
  }
  
  updateExistingHeatMap(heatMapData) {
    // Update your existing heat map array with enhanced data
    if (window.heat && Array.isArray(window.heat)) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (window.heat[r] && window.heat[r][c] !== undefined) {
            window.heat[r][c] = heatMapData.grid[r][c];
          }
        }
      }
      
      // Trigger your existing heat map redraw
      if (window.drawZone) {
        window.drawZone();
      }
    }
  }
  
  testEnhancedPitch() {
    // Create a test pitch with realistic MLB data
    const testPitch = {
      pitchType: ['Fastball', 'Slider', 'Curveball', 'Changeup', 'Cutter'][Math.floor(Math.random() * 5)],
      velocity: 88 + Math.random() * 12,
      location: {
        x: (Math.random() - 0.5) * 1.4, // Within strike zone range
        z: 1.8 + Math.random() * 1.4    // Strike zone height
      },
      outcome: 'Strike'
    };
    
    // Process through game state
    const pitch = this.gameState.processPitch(testPitch);
    
    // Launch with enhanced physics
    if (window.gc.nodes?.ball && window.gc.nodes?.pitcher) {
      this.launchEnhancedBall(pitch);
    }
  }
  
  // MLB StatsAPI integration methods
  processMLBPitchData(mlbData) {
    // Convert MLB StatsAPI format to our internal format
    const {
      pitch: {
        type: pitchType,
        mph: velocity,
        coordinates: { pX: x, pZ: z },
        outcome
      } = {},
      count,
      inning,
      half,
      outs,
      batter,
      pitcher
    } = mlbData;
    
    // Update game situation
    this.gameState.updateGameSituation({
      inning,
      half,
      outs,
      count
    });
    
    // Update players
    if (batter) {
      this.gameState.updateBatter({
        id: batter.id,
        name: batter.name,
        hand: batter.batSide // R or L
      });
    }
    
    if (pitcher) {
      this.gameState.updatePitcher({
        id: pitcher.id,
        name: pitcher.name
      });
    }
    
    // Process the pitch
    const pitchData = {
      pitchType: pitchType || 'Unknown',
      velocity: velocity || 90,
      location: { x: x || 0, z: z || 2.5 },
      outcome: outcome || 'Strike'
    };
    
    const pitch = this.gameState.processPitch(pitchData);
    
    // Launch enhanced ball
    if (window.gc.nodes?.ball && window.gc.nodes?.pitcher) {
      this.launchEnhancedBall(pitch);
    }
    
    console.log('[MLBIntegration] Processed MLB pitch data:', pitchData);
  }
  
  // Integration with your existing stream client
  integrateWithStreamClient() {
    // Hook into your existing stream.client.js events
    document.addEventListener('mlb:pitchData', (event) => {
      this.processMLBPitchData(event.detail);
    });
    
    console.log('[MLBIntegration] Integrated with stream client');
  }
  
  // Utility methods
  getBallStatus() {
    return {
      isEnhanced: this.ballPhysics?.isActive() || false,
      currentPitch: this.ballPhysics?.getCurrentPitch(),
      trailData: this.ballPhysics?.getTrailData()
    };
  }
  
  resetEnhancedSystems() {
    // Reset ball physics
    if (this.ballPhysics && window.gc.nodes?.ball && window.gc.nodes?.pitcher) {
      this.ballPhysics.resetBall(window.gc.nodes.ball, window.gc.nodes.pitcher);
    }
    
    // Reset game state
    this.gameState.resetGame();
    
    console.log('[MLBIntegration] Enhanced systems reset');
  }
  
  getEnhancedStats() {
    return {
      gameState: this.gameState.getCurrentGameState(),
      pitchStats: this.gameState.getPitchStats(),
      ballStatus: this.getBallStatus(),
      heatMapData: this.gameState.getHeatMapData()
    };
  }
  
  // Debug methods
  debugInfo() {
    console.log('[MLBIntegration] Debug Info:', {
      initialized: this.isInitialized,
      gameState: !!this.gameState,
      ballPhysics: !!this.ballPhysics,
      gcReady: !!(window.gc && window.gc.scene),
      stats: this.getEnhancedStats()
    });
  }
}

// Auto-initialize when imported
export const mlbIntegration = new MLBIntegration();

// Export for global access
window.MLBIntegration = MLBIntegration;