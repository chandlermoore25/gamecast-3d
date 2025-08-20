// app.module.local.js — anchors + POV + correct player GLBs (hitter_swing, pitcher_throwing)
// Hardened: urlVariants defined first, early window.gc stub, player anims, gc:ready event, verbose logs.
// FIXED: Added missing play function and other bug fixes

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { snapActors } from './tweaks.snapActors.js';

// ---- URL resolver (MUST be first) ----
function urlVariants(relPath) {
  const list = [];
  try { list.push(new URL(relPath, document.baseURI).href); } catch {}
  try { list.push(new URL(relPath, import.meta.url).href); } catch {}
  try {
    const segs = (location.pathname || '').split('/').filter(Boolean);
    if (segs.length > 0) {
      const base = '/' + segs[0] + '/';
      list.push(base + String(relPath).replace(/^\//,''));
    }
  } catch {}
  list.push(relPath);
  return Array.from(new Set(list));
}

// ---- EARLY gc stub (prevents other scripts from timing out) ----
if (typeof window !== 'undefined') {
  window.gc = window.gc || {};
  window.gc.THREE = THREE;
  window.gc.anchors = window.gc.anchors || {};
  window.gc.nodes = window.gc.nodes || {};
  window.gc.state = window.gc.state || { batterHand: 'R' };
}

// ---- Helpers: fit model height to 1.85m, world-pos, look on XZ ----
function __fitH(obj, target=1.85){
  const box=new THREE.Box3().setFromObject(obj);
  const size=box.getSize(new THREE.Vector3());
  const h=size.y||1;
  let k=target/h;
  if(!isFinite(k)||k<=0)k=1;
  k=Math.max(0.05, Math.min(20, k));
  obj.scale.multiplyScalar(k);
  return k;
}
function __wpos(o){ return o ? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) : null; }
function __lookXZ(obj, tgt){ const p=obj.position.clone(); const t=tgt.clone(); p.y=t.y=0; obj.lookAt(t); }

// ---- Ball tracer (independent of primitives) ----
function ensureTracer(){
  if (window.gc.tracker && window.gc.tracker.line) return window.gc.tracker;
  const geo=new THREE.BufferGeometry();
  const max=600;
  const positions=new Float32Array(max*3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setDrawRange(0,0);
  const mat=new THREE.LineBasicMaterial({ transparent:true, opacity:0.9 });
  const line=new THREE.Line(geo, mat);
  scene.add(line);
  window.gc.tracker = { line, positions, max, count:0 };
  return window.gc.tracker;
}
// ENHANCED: Ball tracing integration
function tracerPush(pos){
  const tr=ensureTracer();
  if(!pos) return;
  const {positions,max}=tr;
  let {count}=tr;
  if (count >= max) {
    // shift left by one (simple approach)
    positions.copyWithin(0, 3, max*3);
    count = max-1;
  }
  positions.set([pos.x,pos.y,pos.z], count*3);
  tr.count = count+1;
  tr.line.geometry.attributes.position.needsUpdate = true;
  tr.line.geometry.setDrawRange(0, tr.count);
  
  // Also update ballTrail if it exists
  if (window.gc?.ballTrail) {
    const trail = window.gc.ballTrail;
    const index = (trail.pointCount % trail.maxPoints) * 3;
    trail.positions[index] = pos.x;
    trail.positions[index + 1] = pos.y;
    trail.positions[index + 2] = pos.z;
    trail.pointCount++;
    const drawCount = Math.min(trail.pointCount, trail.maxPoints);
    trail.line.geometry.setDrawRange(0, drawCount);
    trail.line.geometry.attributes.position.needsUpdate = true;
  }
}

function tracerClear(){
  if(!window.gc.tracker) return;
  window.gc.tracker.count = 0;
  window.gc.tracker.line.geometry.setDrawRange(0,0);
  window.gc.tracker.line.geometry.attributes.position.needsUpdate = true;
  
  // Also clear ballTrail
  if (window.gc?.ballTrail) {
    window.gc.ballTrail.pointCount = 0;
    window.gc.ballTrail.line.geometry.setDrawRange(0, 0);
    window.gc.ballTrail.line.geometry.attributes.position.needsUpdate = true;
  }
}

// Make tracerPush globally accessible
window.tracerPush = tracerPush;
window.tracerClear = tracerClear;

// ================== CONFIG ==================
const REAL_P2R = 18.44;
const PATHS = { field: urlVariants('Models/field.glb') };

// Correct GLBs per your repo (with animations)
const PLAYER_URLS = {
  pitcher: [
    ...urlVariants('Models/Player/pitcher_throwing.glb'),
    ...urlVariants('Player/pitcher_throwing.glb'),
    ...urlVariants('pitcher_throwing.glb')
  ],
  batter: [
    ...urlVariants('Models/Player/hitter_swing.glb'),
    ...urlVariants('Player/hitter_swing.glb'),
    ...urlVariants('hitter_swing.glb')
  ]
};

const MAP = {
  PITCH:'pitch', STRIKE:'pitch',
  SWING:'swing', FOUL:'foul',
  INPLAY:'contact', CONTACT:'contact', SINGLE:'contact', DOUBLE:'contact', TRIPLE:'contact', HOMER:'contact', 'HOME RUN':'contact',
  WALK:'walk', BB:'walk', HBP:'walk',
  STRIKEOUT:'strikeout', 'K LOOKING':'strikeout', 'K SWINGING':'strikeout', DEFAULT:'idle'
};

let scene, camera, renderer, clock, world;
let mixers={}, clips={}, nodes={};
let anchors = {
  plate:null, rubber:null, pov:null,
  batterL_feet:null, batterR_feet:null, pitcher_feet:null
};

let __UNITS_PER_M = null; // field units per meter derived from plate↔rubber
let state = window.gc.state || { batterHand:'R' };
let zoneCanvas, zctx, hudEl;
const heat = Array.from({length:3},()=>[0,0,0]);

// ---- HUD (simple status bottom-left) ----
function addHUD(msg=''){
  try{
    const el=document.createElement('div');
    Object.assign(el.style,{
      position:'absolute',left:'10px',bottom:'10px',color:'#9fe5ff',
      font:'12px/1.3 ui-monospace, Menlo, Consolas',
      background:'rgba(0,0,0,.55)',padding:'8px 10px',
      border:'1px solid #0a3a4a',borderRadius:'10px',maxWidth:'44ch',pointerEvents:'none'
    });
    el.textContent = msg || 'HUD';
    document.body.appendChild(el);
    setInterval(()=>{
      if(!window.gc?.world) return;
      const b=new THREE.Box3().setFromObject(window.gc.world);
      const s=new THREE.Vector3(); b.getSize(s);
      el.textContent = `WORLD scale=${window.gc.world.scale.x.toFixed(3)}  bounds=${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)}`;
    }, 800);
  }catch(e){
    console.warn('[HUD] failed to create', e);
  }
}

boot().catch(err=>fatal(err?.message || String(err)));

async function boot(){
  console.log('[GC] Boot — correct player GLBs + POV + anchors + Y-fix');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 5000);
  camera.position.set(0,1.2,3.2);
  camera.lookAt(0,1.2,0);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(10,18,8);
  scene.add(sun);

  world = new THREE.Group();
  scene.add(world);
  addFailsafe();

  // Load field
  await loadAny(PATHS.field, 'field', (g)=>{ captureAnchors(g.scene); world.add(g.scene);} );

  // Calibrate camera from POV or plate/rubber
  calibrate();

  // Try to spawn players with animations
  await spawnPlayers();

  // Now that anchors & (optionally) players exist, publish them ASAP
  publishGC();

  // Kick any external listeners waiting for ready
  document.dispatchEvent(new CustomEvent('gc:ready', { detail:{ ready:true } }));

  // WAIT for primitives to load before continuing
  await waitForPrimitives();

  setupZone(); drawZone();
  addHUD('LOCAL ESM — anchors + POV + anim players + Y-fix');
  wireUI();
  
  // Disable auto-resnapping that's causing infinite scaling
  console.log('[GC] Disabling problematic auto-resnap');
  
  animate();

  addEventListener('resize', onResize);
}

// Wait for ball and bat to be created by primitives
async function waitForPrimitives() {
  return new Promise((resolve) => {
    const checkPrimitives = () => {
      if (nodes.ball && nodes.bat) {
        console.log('[GC] Primitives loaded - ball and bat ready');
        resolve();
      } else {
        console.log('[GC] Waiting for primitives...', { ball: !!nodes.ball, bat: !!nodes.bat });
        setTimeout(checkPrimitives, 100);
      }
    };
    checkPrimitives();
  });
}

function publishGC(){
  window.gc.scene = scene;
  window.gc.camera = camera;
  window.gc.renderer = renderer;
  window.gc.world = world;
  window.gc.anchors = anchors;
  window.gc.nodes = nodes;
  window.gc.mixers = mixers;
  window.gc.clips = clips;
  window.gc.state = state;
  window.gc.resnap = ()=>{
    if (window.gc.resnapDisabled) {
      console.log('[GC] Resnap disabled, skipping');
      return;
    }
    snapActors({ 
      THREE, 
      anchors, 
      batter:nodes.batter, 
      pitcher:nodes.pitcher, 
      batterMesh:nodes.batterMesh, 
      pitcherMesh:nodes.pitcherMesh, 
      camera, 
      scene, 
      world, 
      state,
      skipGroundFit: true 
    });
  };
  console.log('[GC] debug handle set: window.gc + Y-fix');
}

function addFailsafe(){
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7,64),
    new THREE.MeshStandardMaterial({color:0x5a4026,roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y=0; world.add(ground);
}

async function loadAny(cands,key,onLoaded){
  const loader = new GLTFLoader();
  const list = Array.isArray(cands) ? cands : [cands];
  let lastErr=null, tried=[];
  for(const url of list){
    try{
      const gltf = await new Promise((res,rej)=>loader.load(url,res,undefined,rej));
      nodes[key]=gltf.scene;
      if(gltf.animations?.length){
        mixers[key]=new THREE.AnimationMixer(gltf.scene);
        clips[key]=Object.fromEntries(gltf.animations.map(c=>[c.name,c]));
      } else { mixers[key]=null; clips[key]={}; }
      onLoaded?.(gltf);
      console.log(`[GC] Loaded ${key}: ${url} | clips: ${gltf.animations?.map(a=>a.name).join(', ') || 'none'}`);
      return gltf;
    }catch(e){
      tried.push(url);
      console.warn(`[GC] miss ${key} at ${url}`);
      lastErr = e;
    }
  }
  console.warn(`[GC] fail ${key} after trying: ${tried.join(', ')}`);
  if(lastErr) console.warn(lastErr);
  return null;
}

function findAny(root, needles){
  const want = needles.map(n => String(n).toLowerCase());
  let hit = null;
  root.traverse(o => {
    if (hit) return;
    const n = (o.name || '').toLowerCase();
    if (want.some(w => n.includes(w))) hit = o;
  });
  return hit;
}

function captureAnchors(root){
  anchors.plate  = findAny(root, ['platecenter','homeplate','plate_center','home_plate','home-plate','plate']);
  anchors.rubber = findAny(root, ['rubbercenter','pitchersrubber','moundcenter','rubber_center','mound','rubber']);
  anchors.batterL_feet = findAny(root, ['batterl_feet','batter_l_feet','batter_left_feet','lhb_feet','batterl-legs','batterl']);
  anchors.batterR_feet = findAny(root, ['batterr_feet','batter_r_feet','batter_right_feet','rhb_feet','batterr-legs','batterr']);
  anchors.pitcher_feet = findAny(root, ['pitcher_feet','pitcherfeet','mound_feet','rubber_feet']);
  anchors.pov          = findAny(root, ['pov','camera_pov','cam_pov','view_pov']);

  // compute units-per-meter if both anchors exist
  try{
    root.updateMatrixWorld?.(true);
    if (anchors.plate && anchors.rubber){
      const p = new THREE.Vector3().setFromMatrixPosition(anchors.plate.matrixWorld);
      const r = new THREE.Vector3().setFromMatrixPosition(anchors.rubber.matrixWorld);
      const raw = r.distanceTo(p) || 0;
      if (raw > 0) {
        __UNITS_PER_M = raw / 18.44;
        console.log('[Scale] plate↔rubber raw=', raw.toFixed(3), ' => units/m=', __UNITS_PER_M.toFixed(3));
      }
    }
  }catch(e){ console.warn('[Scale] units/m compute fail', e); }

  console.log('[GC] anchors:', {
    plate: !!anchors.plate, rubber: !!anchors.rubber, pov: !!anchors.pov,
    batterL_feet: !!anchors.batterL_feet, batterR_feet: !!anchors.batterR_feet, pitcher_feet: !!anchors.pitcher_feet
  });
}

function calibrate(){
  if (anchors.pov){
    world.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(anchors.pov.matrixWorld);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    m.decompose(pos, quat, scl);
    camera.near = 0.01; camera.far = 5000; camera.updateProjectionMatrix();
    camera.position.copy(pos);
    camera.quaternion.copy(quat);
    const p = anchors.plate ? new THREE.Vector3().setFromMatrixPosition(anchors.plate.matrixWorld) : new THREE.Vector3(0,0,0);
    camera.lookAt(p);
    console.log('[GC] Calibrated via POV anchor.');
    return;
  }
  if (anchors.plate && anchors.rubber){
    world.updateMatrixWorld(true);
    const plateW  = new THREE.Vector3().setFromMatrixPosition(anchors.plate.matrixWorld);
    const rubberW = new THREE.Vector3().setFromMatrixPosition(anchors.rubber.matrixWorld);
    const raw = rubberW.distanceTo(plateW) || 1;
    const s = REAL_P2R / raw;
    world.scale.multiplyScalar(s);
    world.updateMatrixWorld(true);
    const plateAfter = new THREE.Vector3().setFromMatrixPosition(anchors.plate.matrixWorld);
    world.position.sub(plateAfter);
    world.updateMatrixWorld(true);
    console.log('[GC] Calibrated (anchors catcher-style).');
    return;
  }
  console.log('[GC] Calibrated (fallback).');
}

function __fitToField(obj, targetMeters=1.85){
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const hUnits = size.y || 1;
  const upm = (__UNITS_PER_M && isFinite(__UNITS_PER_M) && __UNITS_PER_M>0) ? __UNITS_PER_M : 1;
  const targetUnits = targetMeters * upm;
  let k = targetUnits / hUnits;
  if (!isFinite(k) || k <= 0) k = 1;
  obj.scale.multiplyScalar(k);
  console.log('[Scale] fitToField hUnits=', hUnits.toFixed(3), 'upm=', upm.toFixed(3), 'k=', k.toFixed(3));
  return k;
}

// Center the model so that the average feet position sits at the local origin (XZ only)
function __centerFeetXZ(root){
  // Try bones first (toes/feet), fallback to bbox-bottom center
  let footWorlds = [];
  try{
    root.traverse(o => {
      if (!o || !o.isBone) return;
      const n = (o.name || '').toLowerCase();
      const isFoot = n.includes('foot') || n.includes('toe');
      const isLR = n.includes('left') || n.includes('right') || n.includes('l_') || n.includes('r_');
      if (isFoot && isLR){
        const v = new THREE.Vector3();
        o.updateMatrixWorld(true);
        o.getWorldPosition(v);
        footWorlds.push(v);
      }
    });
  }catch(e){}
  const toLocal = (v)=> root.worldToLocal(v.clone());
  let offset = new THREE.Vector3(0,0,0);
  if (footWorlds.length >= 1){
    let sum = new THREE.Vector3(0,0,0);
    footWorlds.forEach(v=> sum.add(toLocal(v)));
    const avg = sum.multiplyScalar(1/footWorlds.length);
    offset.set(avg.x, 0, avg.z);
  } else {
    const box = new THREE.Box3().setFromObject(root);
    const cx = (box.min.x + box.max.x) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    offset.set(cx, 0, cz);
  }
  root.position.x -= offset.x;
  root.position.z -= offset.z;
  root.updateMatrixWorld(true);
  console.log('[Center] feetXZ offset', offset.x.toFixed(3), offset.z.toFixed(3));
  return offset;
}

// ================== PLAYER SPAWN + ANIMS ==================
async function spawnPlayers(){
  const pitcherGLB = await loadAny(PLAYER_URLS.pitcher, 'pitcherGLB', null);
  
  if (pitcherGLB?.scene){
    const root = pitcherGLB.scene;
    root.traverse(o=>{o.castShadow=o.receiveShadow=true;});
    __fitToField(root, 1.85);
    
    // Y-Fix BEFORE creating rig - get raw bbox from scaled model
    const rawBbox = new THREE.Box3().setFromObject(root);
    const yFix = isFinite(rawBbox.min.y) ? -rawBbox.min.y : 0;
    root.position.y += yFix;
    console.log('[Y-Fix] Pitcher foot adjustment:', yFix.toFixed(3));
    
    const rigP = new THREE.Group(); rigP.name='pitcherRig'; rigP.add(root);
    nodes.pitcherMesh = root; nodes.pitcher = rigP; scene.add(rigP);

    if (pitcherGLB.animations?.length){
      const m = new THREE.AnimationMixer(root);
      // Start with idle instead of auto-playing throwing
      const clips = Object.fromEntries(pitcherGLB.animations.map(c=>[c.name,c]));
      mixers.pitcher = m;
      clips.pitcher = clips;
      
      // Look for idle first, then any non-action clip
      const idleClip = pickClip(pitcherGLB.animations, ['idle','stand','rest','pose']) || 
                       pitcherGLB.animations.find(a => !['throw','pitch','throwing'].some(w => a.name.toLowerCase().includes(w))) ||
                       pitcherGLB.animations[0];
      
      const action = m.clipAction(idleClip);
      action.setLoop(THREE.LoopRepeat).play();
      console.log('[Anim] pitcher starting with:', idleClip?.name);
    }
  }
  
  const batterGLB = await loadAny(PLAYER_URLS.batter, 'batterGLB', null);
  
  if (batterGLB?.scene){
    const root = batterGLB.scene;
    root.traverse(o=>{o.castShadow=o.receiveShadow=true;});
    __fitToField(root, 1.85);
    
    // Y-Fix BEFORE creating rig - get raw bbox from scaled model
    const rawBbox = new THREE.Box3().setFromObject(root);
    const yFix = isFinite(rawBbox.min.y) ? -rawBbox.min.y : 0;
    root.position.y += yFix;
    console.log('[Y-Fix] Batter foot adjustment:', yFix.toFixed(3));
    
    const rigB = new THREE.Group(); rigB.name='batterRig'; rigB.add(root);
    nodes.batterMesh = root; nodes.batter = rigB; nodes.player = rigB; scene.add(rigB);

    if (batterGLB.animations?.length){
      const m = new THREE.AnimationMixer(root);
      // Start with idle instead of auto-playing swing
      const clips = Object.fromEntries(batterGLB.animations.map(c=>[c.name,c]));
      mixers.batter = m;
      clips.batter = clips;
      
      // Look for idle first, then any non-action clip
      const idleClip = pickClip(batterGLB.animations, ['idle','stand','rest','pose']) || 
                       batterGLB.animations.find(a => !['swing','hit','hitting'].some(w => a.name.toLowerCase().includes(w))) ||
                       batterGLB.animations[0];
      
      const action = m.clipAction(idleClip);
      action.setLoop(THREE.LoopRepeat).play();
      console.log('[Anim] batter starting with:', idleClip?.name);
    }
  }

  // Anchor-driven placement - DISABLE the additional Y adjustment in snapActors
  try{
    // Pass flag to disable Y-adjustment in snapActors since we already did it
    snapActors({ 
      THREE, 
      anchors, 
      batter: nodes.batter, 
      pitcher: nodes.pitcher, 
      batterMesh: nodes.batterMesh, 
      pitcherMesh: nodes.pitcherMesh, 
      camera, 
      scene, 
      world, 
      state,
      skipGroundFit: true // NEW FLAG to prevent double Y-adjustment
    });
  }catch(e){ console.warn('snapActors initial call failed', e); }
}

function pickClip(anims, keywords){
  const kw = keywords.map(s=>s.toLowerCase());
  const found = anims.find(a => kw.some(k => (a.name||'').toLowerCase().includes(k)));
  return found || anims[0];
}

// ================== UI / LOOP ==================
function setupZone(){ zoneCanvas = document.getElementById('zoneCanvas'); zctx = zoneCanvas?.getContext('2d'); }

function heatColor(t){
  const r=Math.floor(255*Math.max(0,t*1.6-0.2)), g=Math.floor(255*Math.min(1,t*1.6+0.2)), b=Math.floor(255*(1-t));
  return `rgba(${r},${g},${b},0.55)`;
}
function bumpHeatAt(x,y){
  x=Math.max(-1,Math.min(1,x)); y=Math.max(-1,Math.min(1,y));
  const col=Math.min(2,Math.max(0,Math.floor((x+1)/2*3)));
  const row=Math.min(2,Math.max(0,Math.floor((1-(y+1)/2)*3)));
  heat[row][col]+=1;
}

function drawZone(){
  if(!zctx || !zoneCanvas) return;
  const ctx=zctx, w=zoneCanvas.width, h=zoneCanvas.height;
  ctx.clearRect(0,0,w,h);
  const m=28, zx=m, zy=m, zw=w-2*m, zh=h-2*m;
  const max=Math.max(1,...heat.flat());
  for(let r=0;r<3;r++) for(let c=0;c<3;c++){
    const v=heat[r][c]/max;
    ctx.fillStyle = heatColor(v);
    ctx.fillRect(zx+c*(zw/3), zy+r*(zh/3), zw/3, zh/3);
  }
  ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2; ctx.strokeRect(zx,zy,zw,zh);
  for(let i=1;i<3;i++){
    const gx=zx+i*(zw/3), gy=zy+i*(zh/3);
    ctx.beginPath(); ctx.moveTo(gx,zy); ctx.lineTo(gx,zy+zh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zx,gy); ctx.lineTo(zx+zw,gy); ctx.stroke();
  }
}

function wireUI(){
  const byId = (id)=>document.getElementById(id);
  byId('btnPitch')?.addEventListener('click',()=>emit({type:'PITCH',desc:'FB 95 [0.2,0.1]'}));
  byId('btnAuto')?.addEventListener('click',toggleAuto);
  byId('btnSide')?.addEventListener('click',()=>{
    state.batterHand = (state.batterHand === 'R') ? 'L' : 'R';
    // REMOVED: Automatic resnapping that was causing infinite scaling
    // try{ snapActors({ THREE, anchors, batter:nodes.batter, pitcher:nodes.pitcher, batterMesh:nodes.batterMesh, pitcherMesh:nodes.pitcherMesh, camera, scene, world, state }); }catch{}
    const b=byId('btnSide'); if(b) b.textContent = `Batter: ${state.batterHand}`;
    console.log('[UI] Batter hand changed to:', state.batterHand, '(resnap disabled to prevent scaling bug)');
  });
  byId('btnReset')?.addEventListener('click',()=>{ reset(); drawZone(); tracerClear(); });
  document.addEventListener('gc:play', e=>{
    const evt=e.detail, key=map(evt);
    play(key, evt);
    const pt = parsePt(evt.desc) || {x:Math.random()*2-1, y:Math.random()*2-1};
    bumpHeatAt(pt.x, pt.y); drawZone();
  });
}

function docById(id){ return document.getElementById(id); }
function sel(s){ return document.querySelector(s); }
function emit(evt){ document.dispatchEvent(new CustomEvent('gc:play',{detail:evt})); }
function parsePt(desc=''){ const m1=/x\s*=\s*([-\d.]+)\s*y\s*=\s*([-\d.]+)/i.exec(desc); if(m1) return {x:+m1[1],y:+m1[2]}; const m2=/\[([-\d.]+)\s*,\s*([-\d.]+)\]/.exec(desc); if(m2) return {x:+m2[1],y:+m2[2]}; }

let auto=null;
function toggleAuto(){ auto?stopAuto():startAuto(); }
function startAuto(){
  const plays=[
    {type:'PITCH',desc:'FB 96 [0.1,0.5]'},
    {type:'SWING',desc:'Hack [-0.2,0.2]'},
    {type:'FOUL',desc:'Backstop [-0.7,0.9]'},
    {type:'PITCH',desc:'SL 86 [0.4,-0.5]'},
    {type:'INPLAY',desc:'Line drive — DOUBLE [0.2,0.1]'},
    {type:'WALK',desc:'BB'},
    {type:'STRIKEOUT',desc:'K swinging [-0.3,-0.4]'}
  ];
  let i=0; auto=setInterval(()=>emit(plays[i++%plays.length]),1500);
  const b=docById('btnAuto')||sel('#btnAuto'); if(b) b.textContent='Auto: ON';
}
function stopAuto(){ clearInterval(auto); auto=null; const b=docById('btnAuto')||sel('#btnAuto'); if(b) b.textContent='Auto'; }

// FIXED: Added missing reset function
function reset(){ 
  play('idle'); 
  heat.forEach(r=>r.fill(0)); 
}

function map(evt){
  const t=String(evt?.type||'').toUpperCase();
  if(MAP[t]) return MAP[t];
  return 'idle';
}

// FIXED: Enhanced play function with proper animation linking
function play(key='idle', evt=null){
  console.log('[PLAY]', key, evt?.desc || '');
  
  const pitcherMixer = mixers.pitcher;
  const batterMixer = mixers.batter;
  const pitcherClips = clips.pitcher || {};
  const batterClips = clips.batter || {};
  
  // Helper to find and play clips
  const playClip = (mixer, clipSet, keywords, fallback = 'idle') => {
    if (!mixer) return false;
    
    const findClip = (words) => {
      return Object.keys(clipSet).find(name => 
        words.some(word => name.toLowerCase().includes(word.toLowerCase()))
      );
    };
    
    let clipName = findClip(keywords);
    if (!clipName) clipName = findClip([fallback]);
    if (!clipName) clipName = Object.keys(clipSet)[0];
    
    if (clipName && clipSet[clipName]) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clipSet[clipName]);
      action.reset().fadeIn(0.1).setLoop(THREE.LoopOnce).play();
      console.log('[ANIM]', mixer === pitcherMixer ? 'pitcher' : 'batter', 'playing:', clipName);
      return true;
    } else {
      console.warn('[ANIM] No clips found for', mixer === pitcherMixer ? 'pitcher' : 'batter', 'keywords:', keywords);
      return false;
    }
  };

  const bat = nodes.bat || window.gc.nodes?.bat;
  const ball = nodes.ball || window.gc.nodes?.ball;
  
  console.log('[PLAY] Available objects:', { bat: !!bat, ball: !!ball });

  switch(key){
    case 'pitch':
      // Pitcher throws, batter ready
      playClip(pitcherMixer, pitcherClips, ['throw', 'pitch', 'throwing'], 'idle');
      playClip(batterMixer, batterClips, ['ready', 'stance', 'idle'], 'idle');
      
      if (ball){
        // Start ball movement toward plate with visible trail
        ball.userData.v = new THREE.Vector3(-0.01, -0.02, 0.065);
        tracerClear(); 
        tracerPush(ball.position);
        console.log('[BALL] Pitch started, ball velocity set');
      }
      break;
      
    case 'swing':
      // Batter swings
      playClip(batterMixer, batterClips, ['swing', 'hit', 'hitting'], 'idle');
      
      if (bat) {
        tween(bat.rotation, 'z', bat.rotation.z, bat.rotation.z - Math.PI * 0.8, 220);
      }
      break;
      
    case 'contact':
      // Both players react to contact
      playClip(pitcherMixer, pitcherClips, ['follow', 'watch', 'idle'], 'idle');
      playClip(batterMixer, batterClips, ['hit', 'contact', 'swing'], 'idle');
      
      if (bat) {
        tween(bat.rotation, 'z', bat.rotation.z, bat.rotation.z - Math.PI * 0.75, 180);
      }
      if (ball) {
        ball.userData.v = new THREE.Vector3(0.02, 0.03, -0.02);
        tracerPush(ball.position);
      }
      break;
      
    case 'foul':
      // Similar to swing but different ball trajectory
      playClip(batterMixer, batterClips, ['swing', 'hit'], 'idle');
      
      if (bat) {
        tween(bat.rotation, 'z', bat.rotation.z, bat.rotation.z - Math.PI * 0.6, 160);
      }
      if (ball) {
        ball.userData.v = new THREE.Vector3(-0.02, 0.02, -0.015);
        tracerPush(ball.position);
      }
      break;
      
    case 'walk':
      // Both players return to idle/rest positions
      playClip(pitcherMixer, pitcherClips, ['idle', 'rest'], 'idle');
      playClip(batterMixer, batterClips, ['walk', 'rest', 'idle'], 'idle');
      
      if (bat) {
        // Relax bat position
        tween(bat.rotation, 'z', bat.rotation.z, bat.rotation.z - Math.PI * 0.15, 300);
        setTimeout(() => {
          tween(bat.rotation, 'z', bat.rotation.z, bat.rotation.z + Math.PI * 0.25, 350);
        }, 200);
      }
      break;
      
    case 'strikeout':
      // Pitcher celebrates, batter disappointed
      playClip(pitcherMixer, pitcherClips, ['celebrate', 'pump', 'idle'], 'idle');
      playClip(batterMixer, batterClips, ['disappointed', 'out', 'idle'], 'idle');
      break;
      
    default:
    case 'idle':
      // Return both to idle positions
      playClip(pitcherMixer, pitcherClips, ['idle', 'stand'], 'idle');
      playClip(batterMixer, batterClips, ['idle', 'stand'], 'idle');
      
      // Reset bat position
      if (bat) {
        tween(bat.rotation, 'z', bat.rotation.z, 0, 500);
      }
      break;
  }
}

function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta();
  for(const k in mixers){ const m=mixers[k]; if(m) m.update(dt); }
  const ball = nodes.ball || window.gc.nodes?.ball;
  if (ball){
    if (ball.userData.v){
      const v=ball.userData.v; ball.position.add(v); v.y-=0.0012;
      if (ball.position.y<0.02){ ball.position.y=0.02; v.y=Math.abs(v.y)*0.35; v.x*=0.8; v.z*=0.8; if(v.length()<0.002) ball.userData.v=null; }
      tracerPush(ball.position);
    }
  }
  renderer.render(scene,camera);
}

function onResize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); }
function fatal(msg){ const el=document.createElement('div'); Object.assign(el.style,{position:'fixed',inset:'0',display:'grid',placeItems:'center',background:'#000',color:'#fff',font:'16px/1.4 ui-monospace'}); el.textContent='Fatal: '+msg; document.body.appendChild(el); }

function tween(obj,key,a,b,ms){
  const t0=performance.now();
  const step=t=>{ const p=Math.min(1,(t-t0)/ms); obj[key]=a+(b-a)*(1-Math.pow(1-p,3)); if(p<1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}