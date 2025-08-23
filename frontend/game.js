// Unified MLB GameCast Engine — Integrated
(function(){
  'use strict';
  function log(){ try { console.log.apply(console, arguments); } catch {} }
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function possibleUrls(relPath){
    const list=[];
    try{ list.push(new URL(relPath, document.baseURI).href);}catch{}
    try{ list.push(new URL(relPath, document.baseURI).href);}catch{}
    try{ const segs=(location.pathname||'').split('/').filter(Boolean); if(segs.length>0){ const base='/' + segs[0] + '/'; list.push(base + String(relPath).replace(/^\//,'')); } }catch{}
    list.push(relPath);
    return Array.from(new Set(list));
  }
  if (typeof window!=='undefined'){ window.gc = window.gc || {}; }
  class GameState{
    constructor(){
      this.state = { inning:1, half:'top', outs:0, count:{balls:0,strikes:0}, batter:{name:'Loading...',avg:'.000',hand:'R'}, pitcher:{name:'Loading...',era:'0.00',pitches:0} };
      this.listeners={};
    }
    on(e,f){ (this.listeners[e]=this.listeners[e]||[]).push(f); }
    emit(e,d){ const ls=this.listeners[e]; if(!ls) return; ls.forEach(fn=>{ try{ fn(d);}catch(err){ console.error(err);} }); }
    update(p){ const prev=JSON.parse(JSON.stringify(this.state)); this.state=Object.assign({}, this.state, p); this.emit('update',{prev,next:this.state}); }
    get(){ return JSON.parse(JSON.stringify(this.state)); }
  }
  class GameCastEngine{
    constructor(){
      this.scene=null; this.camera=null; this.renderer=null; this.world=null; this.nodes={}; this.anchors={}; this.mixers={}; this.clips={};
      this.state=new GameState(); this.clock=new THREE.Clock(); this.heatMap=Array(3).fill(null).map(()=>Array(3).fill(0));
      log('[GameCastEngine] Created');
    }
    async initialize(){
      log('[GameCastEngine] Initializing 3D engine...');
      this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(0x041a26);
      this.camera=new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 500); this.camera.position.set(0,2.1,10);
      this.renderer=new THREE.WebGLRenderer({antialias:true}); if('outputEncoding' in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); this.renderer.setSize(window.innerWidth, window.innerHeight); document.body.appendChild(this.renderer.domElement);
      this.scene.add(new THREE.HemisphereLight(0xffffff,0x1a1a1a,0.95)); const sun=new THREE.DirectionalLight(0xffffff,1.1); sun.position.set(10,18,8); sun.castShadow=true; this.scene.add(sun);
      this.world=new THREE.Group(); this.scene.add(this.world);
      this.addGround();
      await this.loadAssets();
      this.initializeTracer(); this.initializeBallPhysics(); this.initializeZone();
      this.publishGlobals();
      this.startAnimationLoop();
    }
    addGround(){
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({color:0x3f8a9c, roughness:1})); ground.rotation.x=-Math.PI/2; ground.position.y=0; ground.receiveShadow=true; this.scene.add(ground);
      const infield=new THREE.Mesh(new THREE.PlaneGeometry(20,10), new THREE.MeshStandardMaterial({color:0xe8b17c, roughness:1})); infield.rotation.x=-Math.PI/2; infield.position.set(0,0.01,0); this.scene.add(infield);
      const grassLine=new THREE.Mesh(new THREE.PlaneGeometry(200,0.2), new THREE.MeshBasicMaterial({color:0x6cd96c})); grassLine.rotation.x=-Math.PI/2; grassLine.position.set(0,0.02,0); this.scene.add(grassLine);
    }
    async loadAssets(){
      log('[GameCastEngine] Loading assets...');
      const loader=new THREE.GLTFLoader(); const candidates=['frontend/models/field.glb','/frontend/models/field.glb','models/field.glb','field.glb'].flatMap(p=>possibleUrls(p));
      let fieldGLTF=null; for(const url of candidates){ try{ fieldGLTF=await new Promise((res,rej)=>loader.load(url,res,undefined,rej)); log('[GameCastEngine] Field loaded',url); break; }catch(e){} }
      if(fieldGLTF){ const field=fieldGLTF.scene; field.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); this.world.add(field); }
      this.createPrimitives(); log('[GameCastEngine] Assets loaded');
    }
    createPrimitives(){
      const ball=new THREE.Mesh(new THREE.SphereGeometry(0.12,24,24), new THREE.MeshStandardMaterial({color:0xffffff, metalness:0.1, roughness:0.5})); ball.position.set(0,1.5,18); ball.castShadow=true; this.scene.add(ball); this.nodes.ball=ball;
      const bat=new THREE.Group(); const mat=new THREE.MeshStandardMaterial({color:0x8B6B4A, roughness:0.6}); const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.02,0.3,8),mat); handle.position.y=0.15; const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.02,0.6,8),mat); barrel.position.y=0.6; bat.add(handle,barrel); bat.position.set(-1.5,1,-1); bat.rotation.z=-Math.PI*0.15; bat.castShadow=true; this.scene.add(bat); this.nodes.bat=bat; log('[GameCastEngine] Bat created');
    }
    initializeTracer(){
      const maxPoints=250; const geometry=new THREE.BufferGeometry(); const positions=new Float32Array(maxPoints*3); geometry.setAttribute('position', new THREE.BufferAttribute(positions,3)); geometry.setDrawRange(0,0); const line=new THREE.Line(geometry, new THREE.LineBasicMaterial({color:0x00ff88, transparent:true, opacity:0.85})); this.scene.add(line); let pointCount=0;
      window.tracerPush=(pos)=>{ if(pointCount>=maxPoints) return; positions[pointCount*3+0]=pos.x; positions[pointCount*3+1]=pos.y; positions[pointCount*3+2]=pos.z; pointCount++; geometry.setDrawRange(0,pointCount); geometry.attributes.position.needsUpdate=true; };
      window.tracerClear=()=>{ pointCount=0; geometry.setDrawRange(0,pointCount); geometry.attributes.position.needsUpdate=true; };
    }
    initializeBallPhysics(){
      const engine=this; this.ballPhysics=new (class{ constructor(){ this.gravity=new THREE.Vector3(0,-9.81,0); this.drag=0.06; this.velocity=new THREE.Vector3(); this.isActive=false; }
        launch(cfg){ const ball=engine.nodes.ball; if(!ball) return; const location=cfg?.location||{x:0,z:2.5}; const velocity=cfg?.velocity??95; this.velocity.set(location.x*0.02, 0.01, -velocity*0.02); ball.position.set(0,1.5,18); ball.userData.velocity=this.velocity.clone(); ball.userData.isFlying=true; this.isActive=true; if(window.tracerClear) window.tracerClear(); if(window.tracerPush) window.tracerPush(ball.position); log('[BallPhysics] Ball launched:', velocity, 'mph'); }
        update(dt){ if(!this.isActive) return; const ball=engine.nodes.ball; if(!ball||!ball.userData.isFlying) return; this.velocity.addScaledVector(this.gravity, dt*0.4); this.velocity.multiplyScalar(1 - this.drag * dt); ball.position.addScaledVector(this.velocity, dt); if(window.tracerPush) window.tracerPush(ball.position); if(ball.position.y<=0 || ball.position.z < -30){ ball.userData.isFlying=false; this.isActive=false; log('[BallPhysics] Ball stopped'); } }
      })();
    }
    initializeZone(){
      const container=document.querySelector('#strikeZoneOverlay .strike-zone-container')||null;
      if(container && !this.zoneCanvas){ const c=document.createElement('canvas'); c.width=300; c.height=400; container.appendChild(c); this.zoneCanvas=c; this.zctx=c.getContext('2d'); }
      const self=this; window.Zone={ addPitch:function(p){ const loc=p?.location||{x:0,z:2.5}; const vel=p?.velocity||90; const x=clamp(loc.x/0.83,-1,1); const y=clamp((loc.z-2.5)/1.0,-1,1); const col=Math.min(2, Math.max(0, Math.floor((x+1)/2*3))); const row=Math.min(2, Math.max(0, Math.floor((1-(y+1)/2)*3))); self.heatMap[row][col]++; if(window.updateHeatMapUI) window.updateHeatMapUI(self.heatMap); log('[Zone] Added pitch', vel, 'mph at [', row, ',', col, ']'); }, clear:function(){ self.heatMap=Array(3).fill(null).map(()=>Array(3).fill(0)); if(window.updateHeatMapUI) window.updateHeatMapUI(self.heatMap); }, getHeatMap:function(){ return self.heatMap; } };
    }
    startAnimationLoop(){ const animate=()=>{ requestAnimationFrame(animate); const dt=this.clock.getDelta(); if(this.ballPhysics) this.ballPhysics.update(dt); this.renderer.render(this.scene, this.camera); }; animate(); window.animate=animate; }
    publishGlobals(){ window.gc = Object.assign(window.gc||{}, { scene:this.scene, camera:this.camera, renderer:this.renderer, world:this.world, nodes:this.nodes, anchors:this.anchors, mixers:this.mixers, clips:this.clips, state:this.state.get(), clock:this.clock, THREE:THREE, zoneCanvas:this.zoneCanvas, zctx:this.zctx }); }
    play(actionKey, data){ switch(actionKey){ case 'pitch': this.ballPhysics.launch(data||{velocity:95, location:{x:(Math.random()-0.5)*0.8, z:2.2+Math.random()*0.6}}); if(window.Zone) window.Zone.addPitch({velocity:95, location:{x:(Math.random()-0.5)*0.8, z:2.2+Math.random()*0.6}}); break; case 'swing': if(this.nodes.bat){ const o=this.nodes.bat.rotation.z; this.nodes.bat.rotation.z = o - Math.PI*0.35; setTimeout(()=>{ this.nodes.bat.rotation.z=o; }, 250);} break; case 'contact': this.play('pitch'); setTimeout(()=>this.play('swing'), 300); break; default: console.warn('[GameCastEngine] Unknown action:', actionKey); } }
    reset(){ if(this.nodes.ball){ this.nodes.ball.position.set(0,1.5,18); this.nodes.ball.userData.isFlying=false; } if(this.nodes.bat){ this.nodes.bat.rotation.z=-Math.PI*0.15; } if(window.tracerClear) window.tracerClear(); if(window.Zone) window.Zone.clear(); log('[GameCastEngine] Reset'); }
  }
  class MLBIntegration{
    constructor(engine){ this.engine=engine; this.gameState=engine.state; this.streamClient=this.createStreamClient(); log('[MLBIntegration] Initialized'); }
    createStreamClient(){ const self=this; const client={ backend:'http://localhost:8000', connected:false, mode:'replay', speed:1,
      setBackend(url){ this.backend=url; }, setMode(m){ this.mode=m; }, setSpeed(s){ this.speed=s; },
      connect(opts){ self.connectToGame(opts); }, disconnect(){ self.disconnectFromGame(); }, isConnected(){ return this.connected; } };
      window.streamClient=client; log('[MLBIntegration] Stream client ready'); return client; }
    async loadGames(dateStr){ const url=`${this.streamClient.backend}/api/games?date=${encodeURIComponent(dateStr)}`; const res=await fetch(url); if(!res.ok) throw new Error(`HTTP ${res.status}`); const data=await res.json(); log('[MLBIntegration] Loaded games:', data?.length||0); return data||[]; }
    connectToGame({gamePk,replayFilter}){ log(`[MLBIntegration] Connecting to game ${gamePk} (${this.streamClient.mode}) @ ${this.streamClient.backend}`); this.streamClient.connected=true; document.dispatchEvent(new CustomEvent('gc:connected',{detail:{gamePk}}));
      const tick=()=>{ if(!this.streamClient.connected) return; const play={ type:'pitch', velocity:92+Math.floor(Math.random()*6), pitchType:['FF','SL','CU'][Math.floor(Math.random()*3)], location:{x:(Math.random()-0.5)*0.8, z:2.2+Math.random()*0.6} }; this.gameState.state.count.strikes = clamp(this.gameState.state.count.strikes + (Math.random()<0.5?1:0), 0, 2); this.gameState.state.count.balls = clamp(this.gameState.state.count.balls + (Math.random()<0.5?1:0), 0, 3); document.dispatchEvent(new CustomEvent('gc:play',{detail:{...play,type:'pitch'}})); if(window.updateGameUI) window.updateGameUI(this.gameState.state); setTimeout(tick, 1000/this.streamClient.speed); }; setTimeout(tick, 600); }
    disconnectFromGame(){ this.streamClient.connected=false; document.dispatchEvent(new CustomEvent('gc:disconnected')); }
    getGameState(){ return this.gameState.get(); }
    getPitchStats(){ return { total: this.gameState.state.count.balls + this.gameState.state.count.strikes, avgVelocity: 94 }; }
  }
  class ManualControls{ constructor(engine){ this.engine=engine; log('[ManualControls] Initialized'); } testPitch(){ this.engine.play('pitch'); } testSwing(){ this.engine.play('swing'); } testContact(){ this.engine.play('contact'); } resetAllSystems(){ this.engine.reset(); } }
  class MLBGameCast{
    constructor(){ this.engine=null; this.mlbIntegration=null; this.manualControls=null; this.initialized=false; log('[MLBGameCast] Created'); }
    async initialize(){ if(this.initialized) return; log('[MLBGameCast] Initializing complete system...'); try{ this.engine=new GameCastEngine(); await this.engine.initialize(); this.mlbIntegration=new MLBIntegration(this.engine); this.manualControls=new ManualControls(this.engine); this.publishAPI(); document.addEventListener('gc:play',(ev)=>{ const d=ev.detail||{}; this.engine.play(d.type, d); }); window.addEventListener('resize', ()=>{ if(this.engine?.camera && this.engine?.renderer){ this.engine.camera.aspect=window.innerWidth/window.innerHeight; this.engine.camera.updateProjectionMatrix(); this.engine.renderer.setSize(window.innerWidth, window.innerHeight); } }); }catch(err){ console.error('[MLBGameCast] Initialization error:', err); } this.initialized=true; document.dispatchEvent(new CustomEvent('gc:ready')); log('[MLBGameCast] System ready'); }
    publishAPI(){ const self=this; window.mlbGameCast={ engine:self.engine, mlbIntegration:self.mlbIntegration, manualControls:self.manualControls, testPitch(){ self.manualControls.testPitch(); }, testSwing(){ self.manualControls.testSwing(); }, testContact(){ self.manualControls.testContact(); }, reset(){ self.engine.reset(); }, loadGames(date){ return self.mlbIntegration.loadGames(date); }, connectToGame(opts){ return self.mlbIntegration.streamClient.connect(opts); }, isInitialized(){ return !!self.initialized; }, getGameState(){ return self.mlbIntegration.getGameState(); }, getPitchStats(){ return self.mlbIntegration.getPitchStats(); } }; log('[MLBGameCast] API published'); }
  }
  function waitForDependencies(){ const threeReady=typeof THREE!=='undefined'; const gltfReady=threeReady && !!THREE.GLTFLoader; const domReady=document.readyState!=='loading'; if(threeReady && gltfReady && domReady){ log('[GameCast] Deps ready — starting…'); startGame(); return; } setTimeout(waitForDependencies, 100); }
  function startGame(){ try{ const app=new MLBGameCast(); app.initialize(); }catch(e){ console.error('[GameCast] Fatal boot error:', e); } }
  waitForDependencies();
})();