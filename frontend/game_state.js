// gameState.js - Enhanced game state management for MLB integration
// Handles batter/pitcher logic, heat map data, and live game state

export class GameState {
  constructor() {
    this.state = {
      // Game situation
      gameId: null,
      inning: 1,
      half: 'top',
      outs: 0,
      count: { balls: 0, strikes: 0 },
      
      // Players
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
      
      // Heat map data (enhanced)
      heatMap: {
        grid: Array(3).fill(null).map(() => Array(3).fill(0)),
        pitches: [], // Store all pitch data
        bounds: {
          left: -0.83,   // MLB strike zone bounds
          right: 0.83,
          bottom: 1.5,
          top: 3.5
        }
      },
      
      // Current at-bat
      atBat: {
        pitchCount: 0,
        outcome: null,
        sequence: []
      }
    };
    
    this.listeners = new Map();
    this.ballPhysics = null; // Will be set by integration
    
    console.log('[GameState] Enhanced game state initialized');
  }
  
  // Event system
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
  
  // Game situation updates
  updateGameSituation(gameData) {
    const { gameId, inning, half, outs, count } = gameData;
    
    const changed = {
      gameId: this.state.gameId !== gameId,
      inning: this.state.inning !== inning || this.state.half !== half,
      outs: this.state.outs !== outs,
      count: this.state.count.balls !== count?.balls || this.state.count.strikes !== count?.strikes
    };
    
    // Update state
    if (gameId) this.state.gameId = gameId;
    if (inning) this.state.inning = inning;
    if (half) this.state.half = half;
    if (typeof outs === 'number') this.state.outs = outs;
    if (count) this.state.count = { ...count };
    
    // Emit specific change events
    if (changed.inning) this.emit('inning:changed', { inning, half });
    if (changed.outs) this.emit('outs:changed', outs);
    if (changed.count) this.emit('count:changed', count);
    
    this.emit('game:updated', this.state);
  }
  
  // Player updates
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
  
  // Pitch processing
  processPitch(pitchData) {
    const {
      pitchType = 'Unknown',
      velocity = 0,
      location = { x: 0, z: 0 },
      outcome = '',
      timestamp = Date.now()
    } = pitchData;
    
    // Create pitch record
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
    
    // Add to sequences
    this.state.heatMap.pitches.push(pitch);
    this.state.atBat.sequence.push(pitch);
    this.state.atBat.pitchCount++;
    
    // Update heat map grid
    this.updateHeatMapGrid(location.x, location.z);
    
    // Emit events
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
    
    // Convert MLB coordinates to 3x3 grid
    const col = Math.floor(((x - bounds.left) / (bounds.right - bounds.left)) * 3);
    const row = Math.floor(((bounds.top - z) / (bounds.top - bounds.bottom)) * 3);
    
    // Clamp to grid bounds
    const gridCol = Math.max(0, Math.min(2, col));
    const gridRow = Math.max(0, Math.min(2, row));
    
    this.state.heatMap.grid[gridRow][gridCol]++;
  }
  
  isInStrikeZone(x, z) {
    const { bounds } = this.state.heatMap;
    return x >= bounds.left && x <= bounds.right && z >= bounds.bottom && z <= bounds.top;
  }
  
  // At-bat management
  startNewAtBat(batterData) {
    // Complete previous at-bat if exists
    if (this.state.atBat.sequence.length > 0) {
      this.emit('atBat:completed', this.state.atBat);
    }
    
    // Reset at-bat
    this.state.atBat = {
      pitchCount: 0,
      outcome: null,
      sequence: [],
      startTime: Date.now()
    };
    
    // Update batter if provided
    if (batterData) {
      this.updateBatter(batterData);
    }
    
    this.emit('atBat:started', this.state.atBat);
  }
  
  completeAtBat(outcome) {
    this.state.atBat.outcome = outcome;
    this.state.atBat.endTime = Date.now();
    
    this.emit('atBat:completed', this.state.atBat);
    
    console.log('[GameState] At-bat completed:', outcome);
  }
  
  // Heat map management
  getHeatMapData() {
    return {
      grid: this.state.heatMap.grid.map(row => [...row]), // Deep copy
      pitches: [...this.state.heatMap.pitches],
      bounds: { ...this.state.heatMap.bounds },
      maxValue: Math.max(1, ...this.state.heatMap.grid.flat())
    };
  }
  
  clearHeatMap() {
    this.state.heatMap.grid = Array(3).fill(null).map(() => Array(3).fill(0));
    this.state.heatMap.pitches = [];
    
    this.emit('heatMap:cleared');
    console.log('[GameState] Heat map cleared');
  }
  
  // Statistics
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
    
    // Count pitch types
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
  
  // Ball physics integration callbacks
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
  
  // Integration helpers
  setBallPhysics(ballPhysics) {
    this.ballPhysics = ballPhysics;
  }
  
  // Demo/test methods
  addTestPitch(x = null, z = null) {
    const testPitch = {
      pitchType: ['Fastball', 'Slider', 'Curveball', 'Changeup'][Math.floor(Math.random() * 4)],
      velocity: 88 + Math.random() * 12,
      location: {
        x: x !== null ? x : (Math.random() - 0.5) * 1.6,
        z: z !== null ? z : 1.5 + Math.random() * 2
      },
      outcome: Math.random() > 0.6 ? 'Strike' : 'Ball'
    };
    
    return this.processPitch(testPitch);
  }
  
  generateTestSequence(count = 5) {
    console.log('[GameState] Generating test pitch sequence...');
    
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        this.addTestPitch();
      }, i * 500);
    }
  }
  
  // Reset methods
  resetAtBat() {
    this.state.atBat = {
      pitchCount: 0,
      outcome: null,
      sequence: []
    };
    
    this.emit('atBat:reset');
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
}