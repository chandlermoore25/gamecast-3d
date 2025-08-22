// gc.brain.js — Orchestration layer (attachments, bridging, tracer, zone feed)
(function(){
  'use strict';

  const log = (...a)=>console.log('[BRAIN]', ...a);

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function waitForGC(cb, tries=0){
    const ok = window.gc && window.gc.scene && window.gc.nodes && (window.THREE || (window.gc && window.gc.THREE));
    if (ok) cb();
    else if (tries < 240) setTimeout(()=>waitForGC(cb, tries+1), 50);
    else console.warn('[BRAIN] GameCast not ready after waiting.');
  }

  function getTHREE(){
    return (window.gc && window.gc.THREE) || window.THREE;
  }

  // ---- Tracer fallback (if app didn't provide one)
  function ensureTracer(){
    if (window.tracerPush) return;
    const THREE = getTHREE();
    const scene = window.gc && window.gc.scene;
    if (!THREE || !scene) return;
    const maxPts = 256;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxPts*3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ transparent:true, opacity:0.9 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    let idx = 0;
    window.tracerPush = (vec3)=>{
      positions[idx*3+0]=vec3.x; positions[idx*3+1]=vec3.y; positions[idx*3+2]=vec3.z;
      idx=(idx+1)%maxPts;
      geo.attributes.position.needsUpdate = true;
    };
    console.log('[BRAIN] 🧵 Tracer fallback installed');
  }

  // ---- Bone helpers
  function findHandBone(root, handed){
    const bones = [];
    root.traverse(o=>{ if (o.isBone) bones.push(o); });
    function score(name){
      const n = name.toLowerCase();
      let s = 0;
      if (n.includes('hand')) s += 3;
      if (n.includes('wrist')) s += 2;
      if (n.includes('forearm') || n.includes('lowerarm')) s += 1;
      const isR = /right|_r$|\.r$|hand_r|mixamorigrighthand/.test(n);
      const isL = /left|_l$|\.l$|hand_l|mixamoringlefthand/.test(n);
      if ((handed==='R' && isR) || (handed==='L' && isL)) s += 2;
      if ((handed==='R' && isL) || (handed==='L' && isR)) s -= 2;
      if (n.includes('shoulder')) s -= 4;
      return s;
    }
    let best=null, bestScore=-999;
    for (const b of bones){ const sc=score(b.name); if (sc>bestScore){ best=b; bestScore=sc; } }
    return best;
  }

  // ---- Attach bat to batter hand; preserve world scale; set sensible local offset
  function attachBatToHand(){
    const THREE = getTHREE();
    const nodes = window.gc?.nodes || {};
    const batter = nodes.batterMesh || nodes.batter;
    const bat = nodes.bat;
    if (!batter || !bat) return false;
    if (bat.userData && bat.userData.attachedToBone) return true;

    const handed = (window.gc?.state?.batterHand) || 'R';
    const hand = findHandBone(batter, handed);
    if (!hand) { console.log('[BRAIN] ❌ No hand/wrist bone found; will retry'); return false; }
    if (/shoulder/i.test(hand.name)) { console.log('[BRAIN] ⚠️ Picked shoulder; retry later:', hand.name); return false; }

    // preserve world scale across reparenting
    const preWorld = new THREE.Vector3(); bat.getWorldScale(preWorld);
    hand.updateMatrixWorld(true);
    hand.add(bat);
    bat.userData.attachedToBone = true;
    bat.userData.positioned = true;

    const parentScale = new THREE.Vector3(); hand.getWorldScale(parentScale);
    bat.scale.set(
      preWorld.x / Math.max(1e-6, parentScale.x),
      preWorld.y / Math.max(1e-6, parentScale.y),
      preWorld.z / Math.max(1e-6, parentScale.z)
    );

    const isR = handed==='R';
    bat.position.set(isR ? -0.04 : 0.04, 0.06, isR ? -0.02 : 0.02);
    bat.rotation.set(0, isR ? -Math.PI*0.5 : Math.PI*0.5, isR ? -0.25 : 0.25);

    console.log(`[BRAIN] 🪵 Bat attached to ${handed}-hand bone "${hand.name}"`);
    return true;
  }

  // ---- Bridge enhanced physics so all callers go through one path
  function bridgeEnhancedPhysics(){
    window.gc = window.gc || {};
    window.gc.enhanced = window.gc.enhanced || {};
    window.gc.enhanced.ballPhysics = window.gc.enhanced.ballPhysics || {};

    const prefer = (opts)=>{
      if (window.ballBatLogic?.launchBall){
        try { window.ballBatLogic.launchBall(opts); return true; } catch(e){ console.warn('[BRAIN] launchBall failed', e); }
      }
      return false;
    };

    window.gc.enhanced.ballPhysics.launchFromHand = (loc, vel)=>{
      const used = prefer({ enabled:true, location:loc, velocity:vel });
      if (!used){
        // minimal fallback
        const THREE = getTHREE();
        const nodes = window.gc?.nodes || {};
        const ball = nodes.ball;
        if (!THREE || !ball) return;
        ball.userData.isEnhanced = true;
        ball.userData.enhancedVelocity = new THREE.Vector3((loc?.x||0)*2, 1.2, (loc?.z||2.5)+25).normalize().multiplyScalar((vel||95)/55);
      }
    };

    window.gc.enhanced.ballPhysics.reset = ()=>{
      try { window.ballBatLogic?.reset?.(); } catch {}
      const ball = window.gc?.nodes?.ball;
      if (ball){ ball.userData.isEnhanced=false; ball.userData.enhancedVelocity=null; }
    };

    console.log('[BRAIN] ✅ Enhanced physics bridged through ballBatLogic (with fallback)');
  }

  // ---- Debounce launchBall to prevent double triggers within 120ms
  function installLaunchDebounce(){
    const target = window.ballBatLogic && window.ballBatLogic.launchBall;
    if (!target || target.__debounced) return;
    let t0 = 0;
    function debounced(opts){
      const now = performance.now();
      if (now - t0 < 120){ console.log('[BRAIN] ⏱️ launchBall debounced'); return; }
      t0 = now;
      return target.call(window.ballBatLogic, opts);
    }
    debounced.__debounced = true;
    window.ballBatLogic.launchBall = debounced;
    console.log('[BRAIN] 🚦 launchBall debouncer installed');
  }

  // ---- Feed strike zone from gc:play events
  function wireZoneFeed(){
    window.addEventListener('gc:play', (e)=>{
      try{
        const bp = e.detail?.animation?.ballPhysics;
        if (bp?.location) window.Zone?.addPitch({location:bp.location, velocity:bp.velocity, pitchType:bp.pitchType});
      }catch(err){ console.warn('[BRAIN] gc:play zone feed failed', err); }
    });
  }

  // ---- periodic tick to (re)attach bat (models can arrive late)
  let attached = false;
  function tick(){
    try{ if (!attached) attached = attachBatToHand(); }catch(e){ console.warn('[BRAIN] attach error', e); }
    setTimeout(tick, 400);
  }

  onReady(()=>{
    waitForGC(()=>{
      console.log('[BRAIN] Boot — orchestrating subsystems');
      ensureTracer();
      bridgeEnhancedPhysics();
      installLaunchDebounce();
      wireZoneFeed();
      attached = attachBatToHand();
      tick();
    });
  });
})();
