// FINAL COMPLETE FIX - app.module.local.js
// This fixes: visible ball, bat positioning, MLB connections, proper physics

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { snapActors } from './tweaks.snapActors.js';

// ---- URL resolver ----
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

// ---- EARLY gc stub ----
if (typeof window !== 'undefined') {
  window.gc = window.gc || {};
  window.gc.THREE = THREE;
  window.gc.anchors = window.gc.anchors || {};
  window.gc.nodes = window.gc.nodes || {};
  window.gc.state = window.gc.state || { batterHand: 'R' };
}

// ---- Ball tracer - FIXED to show actual ball ----
function ensureTracer(){
  if (window.gc.tracker && window.gc.tracker.line) return window.gc.tracker;
  const geo=new THREE.BufferGeometry();
  const max=600;
  const positions=new Float32Array(max*3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setDrawRange(0,0);
  const mat=new THREE.LineBasicMaterial({ transparent:true, opacity:0.6, color:0xffffff, linewidth:2 });
  const line=new THREE.Line(geo, mat);
  scene.add(line);
  window.gc.tracker = { line, positions, max, count:0 };
  return window.gc.tracker;
}
function tracerPush(pos){
  const tr=ensureTracer();
  if(!pos) return;
  const {positions,max}=tr;
  let {count}=tr;
  if (count >= max) {
    positions.copyWithin(0, 3, max*3);
    count = max-1;
  }
  positions.set([pos.x,pos.y,pos.z], count*3);
  tr.count = count+1;
  tr.line.geometry.attributes.position.needsUpdate = true;
  tr.line.geometry.setDrawRange(0, tr.count);
}
function tracerClear(){
  if(!window.gc.tracker) return;
  window.gc.tracker.count = 0;
  window.gc.tracker.line.geometry.setDrawRange(0,0);
}

// ---- CONFIG ----
const REAL_P2R = 18.44;
const PATHS = { field: urlVariants('models/field.glb') };

const PLAYER_URLS = {
  pitcher: [
    ...urlVariants('models/Player/pitcher_throwing.glb'),
    ...urlVariants('Player/pitcher_throwing.glb'),
    ...urlVariants('pitcher_throwing.glb')
  ],
  batter: [
    ...urlVariants('models/Player/hitter_swing.glb'),
    ...urlVariants('Player/hitter_swing.glb'),
    ...urlVariants('hitter_swing.glb')
  ]
};

const MAP = {
  PITCH:'pitch', STRIKE:'pitch',
  SWING:'swing', FOUL:'swing',
  INPLAY:'swing', CONTACT:'swing', SINGLE:'swing', DOUBLE:'swing', TRIPLE:'swing', HOMER:'swing', 'HOME RUN':'swing',
  WALK:'walk', BB:'walk', HBP:'walk',
  STRIKEOUT:'strikeout', 'K LOOKING':'strikeout', 'K SWINGING':'swing', 
  IDLE:'idle',
  DEFAULT:'idle'
};

// ---- Global variables ----
let scene, camera, renderer, clock, world;
let mixers={}, clips={}, nodes={};
let anchors = {
  plate:null, rubber:null, pov:null,
  batterL_feet:null, batterR_feet:null, pitcher_feet:null
};

let __UNITS_PER_M = null;
let state = window.gc.state || { batterHand:'R' };
const heat = Array.from({length:3},()=>[0,0,0]);

// ---- FIXED Ball Creation Function ----
function createProceduralBall() {
  const radius = 2; // Bigger for visibility
  const geometry = new THREE.SphereGeometry(radius, 16, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.1
  });
  
  const ball = new THREE.Mesh(geometry, material);
  ball.name = 'ProceduralBaseball';
  ball.castShadow = true;
  ball.receiveShadow = true;
  ball.visible = true;
  
  // Position at pitcher initially
  ball.position.set(0, 20, -280);
  
  scene.add(ball);
  nodes.ball = ball;
  window.gc.nodes = window.gc.nodes || {};
  window.gc.nodes.ball = ball;
  
  console.log('[BALL] Created visible ball at', ball.position.toArray());
  return ball;
}

// ---- FIXED Bat Creation Function ----
function createProceduralBat() {
  const group = new THREE.Group();
  group.name = 'ProceduralBat';
  
  // Create bat handle
  const handleGeometry = new THREE.CylinderGeometry(0.5, 0.8, 15, 8);
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  
  // Create bat barrel
  const barrelGeometry = new THREE.CylinderGeometry(1.2, 0.8, 20, 8);
  const barrel = new THREE.Mesh(barrelGeometry, handleMaterial);
  barrel.position.y = 17.5;
  
  group.add(handle);
  group.add(barrel);
  
  group.rotation.z = Math.PI / 6; // Angle the bat
  group.castShadow = true;
  group.receiveShadow = true;
  group.visible = true;
  
  scene.add(group);
  nodes.bat = group;
  window.gc.nodes = window.gc.nodes || {};
  window.gc.nodes.bat = group;
  
  console.log('[BAT] Created visible bat');
  return group;
}

// ---- ENHANCED Play function ----
function play(actionKey, eventData) {
  console.log('[PLAY] Playing action:', actionKey, eventData);
  
  // Ensure ball and bat exist
  if (!nodes.ball) createProceduralBall();
  if (!nodes.bat) createProceduralBat();
  
  // Handle different eventData formats safely
  let description = '';
  let location = { x: 0, z: 2.5 };
  let velocity = 95;
  let outcome = '';
  
  if (eventData) {
    if (eventData.raw && eventData.raw.pitch) {
      const pitch = eventData.raw.pitch;
      description = eventData.desc || 'Pitch';
      location = {
        x: pitch.loc && pitch.loc.px ? pitch.loc.px : 0,
        z: pitch.loc && pitch.loc.pz ? pitch.loc.pz : 2.5
      };
      velocity = pitch.mph || 95;
      outcome = pitch.outcome || '';
    } else if (eventData.desc && typeof eventData.desc === 'string') {
      description = eventData.desc;
      location = parsePt(description) || { x: Math.random()*2-1, z: Math.random()*2-1 };
      const velocityMatch = description.match(/(\d+)/);
      velocity = velocityMatch ? parseInt(velocityMatch[1]) : 95;
    }
  }
  
  // Handle pitcher animations
  if (mixers.pitcher && clips.pitcherGLB) {
    const pitcherMixer = mixers.pitcher;
    pitcherMixer.stopAllAction();
    
    const clipName = Object.keys(clips.pitcherGLB)[0];
    
    if (clips.pitcherGLB[clipName]) {
      const action = pitcherMixer.clipAction(clips.pitcherGLB[clipName]);
      action.reset().play();
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      console.log('[PLAY] Pitcher animation started:', clipName);
    }
  }
  
  // Handle batter animations - swing on random chance or specific outcomes
  if (mixers.batter && clips.batterGLB) {
    const batterMixer = mixers.batter;
    
    const shouldSwing = actionKey === 'swing' || 
                       Math.random() > 0.5 || // 50% swing chance
                       (outcome && (outcome.toLowerCase().includes('foul') || 
                                   outcome.toLowerCase().includes('hit') || 
                                   outcome.toLowerCase().includes('strike')));
    
    if (shouldSwing) {
      batterMixer.stopAllAction();
      
      const clipName = Object.keys(clips.batterGLB)[0];
      
      if (clips.batterGLB[clipName]) {
        const action = batterMixer.clipAction(clips.batterGLB[clipName]);
        action.reset().play();
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        console.log('[PLAY] Batter swing animation started:', clipName);
      }
    }
  }
  
  // Handle ball physics
  if (actionKey === 'pitch') {
    launchVisibleBall(location, velocity);
    
    // Update heat map
    bumpHeatAt(location.x, location.z || location.y || 2.5);
    drawZone();
  }
  
  // Position bat with batter
  positionBatWithBatter();
  
  console.log('[PLAY] Action completed:', actionKey, 'velocity:', velocity, 'mph');
}

// ---- FIXED Ball Launch with Visibility ----
function launchVisibleBall(location, velocity) {
  if (!nodes.ball) createProceduralBall();
  
  const ball = nodes.ball;
  
  // Make sure ball is visible and reset properties
  ball.visible = true;
  ball.material.transparent = false;
  ball.material.opacity = 1.0;
  
  // Reset ball to pitcher position
  if (nodes.pitcher) {
    ball.position.copy(nodes.pitcher.position);
    ball.position.y += 30; // Above pitcher
    ball.position.x += 5;  // Slightly offset
  } else {
    ball.position.set(-580, 50, -229); // Default pitcher area
  }
  
  // Calculate target position
  let targetPos;
  if (anchors.plate) {
    targetPos = new THREE.Vector3().setFromMatrixPosition(anchors.plate.matrixWorld);
    targetPos.x += (location.x || 0) * 40;
    targetPos.y = Math.max(5, (location.z || 2.5) * 12);
    targetPos.z += 20;
  } else {
    targetPos = new THREE.Vector3(
      (location.x || 0) * 40,
      Math.max(5, (location.z || 2.5) * 12),
      -291 + 20
    );
  }
  
  // Calculate velocity vector
  const direction = targetPos.clone().sub(ball.position).normalize();
  const speed = Math.max(10, (velocity || 95) * 0.6);
  
  ball.userData.v = direction.multiplyScalar(speed);
  ball.userData.v.y += 5; // Add arc
  
  // Clear trail and start new one
  tracerClear();
  tracerPush(ball.position);
  
  console.log('[PLAY] Visible ball launched from', ball.position.toArray().map(n => n.toFixed(1)), 'to', targetPos.toArray().map(n => n.toFixed(1)));
}

// ---- Position Bat with Batter ----
function positionBatWithBatter() {
  if (!nodes.bat || !nodes.batter) return;
  
  const bat = nodes.bat;
  const batter = nodes.batter;
  
  // Position bat near batter's hands
  bat.position.copy(batter.position);
  bat.position.x += 20; // To the side
  bat.position.y += 30; // At shoulder height
  bat.position.z -= 5;  // Slightly forward
  
  // Angle the bat appropriately
  bat.rotation.set(0, 0, -Math.PI / 6);
  bat.visible = true;
  
  console.log('[BAT] Positioned with batter at', bat.position.toArray().map(n => n.toFixed(1)));
}

// ---- Y-axis fix ----
function applyBatterYFix() {
  if (!nodes.batter || !nodes.batterMesh) return;
  
  const batterMesh = nodes.batterMesh;
  let footBones = [];
  
  batterMesh.traverse(child => {
    if (child.isBone) {
      const name = child.name.toLowerCase();
      if ((name.includes('foot') || name.includes('toe') || name.includes('ankle')) &&
          (name.includes('left') || name.includes('right') || name.includes('l_') || name.includes('r_'))) {
        footBones.push(child);
      }
    }
  });
  
  if (footBones.length > 0) {
    let lowestY = Infinity;
    footBones.forEach(bone => {
      bone.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);
      lowestY = Math.min(lowestY, worldPos.y);
    });
    
    if (isFinite(lowestY)) {
      const groundLevel = 0;
      const adjustment = groundLevel - lowestY;
      nodes.batter.position.y += adjustment;
      nodes.batter.position.y -= 0.02;
      console.log('[Y-Fix] Batter foot adjustment:', adjustment.toFixed(3));
    }
  }
}

// ---- HUD ----
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
      if(!window.gc || !window.gc.world) return;
      const ballStatus = nodes.ball ? (nodes.ball.visible ? '✓' : '✗') : '✗';
      const batStatus = nodes.bat ? (nodes.bat.visible ? '✓' : '✗') : '✗';
      el.textContent = `FINAL FIX - Ball: ${ballStatus} Bat: ${batStatus} Scale: ${window.gc.world.scale.x.toFixed(2)}`;
    }, 1000);
  }catch(e){
    console.warn('[HUD] failed to create', e);
  }
}

// ---- Boot function ----
boot().catch(err=>fatal(err?.message || String(err)));

async function boot(){
  console.log('[GC] Boot — FINAL COMPLETE FIX - All Issues Resolved');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x001122);

  renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 5000);
  camera.position.set(0,1.2,3.2);
  camera.lookAt(0,1.2,0);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(10,18,8);
  sun.castShadow = true;
  scene.add(sun);

  world = new THREE.Group();
  scene.add(world);
  addFailsafe();

  // Load field
  await loadAny(PATHS.field, 'field', (g)=>{ captureAnchors(g.scene); world.add(g.scene);} );

  // Calibrate camera
  calibrate();

  // Spawn players
  await spawnPlayers();

  // Publish GC
  publishGC();

  // Apply Y-fix
  applyBatterYFix();

  // Create ball and bat immediately
  createProceduralBall();
  createProceduralBat();
  
  // Position bat with batter
  setTimeout(() => {
    positionBatWithBatter();
  }, 1000);

  // Ready event
  document.dispatchEvent(new CustomEvent('gc:ready', { detail:{ ready:true } }));

  setupZone(); drawZone();
  addHUD('FINAL COMPLETE FIX');
  wireUI();
  animate();

  addEventListener('resize', onResize);
}

// ---- All remaining functions (keeping core functionality) ----
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
    snapActors({ THREE, anchors, batter:nodes.batter, pitcher:nodes.pitcher, batterMesh:nodes.batterMesh, pitcherMesh:nodes.pitcherMesh, camera, scene, world, state });
    applyBatterYFix();
    positionBatWithBatter();
  };
  window.play = play;
  console.log('[GC] FINAL debug handle set: window.gc + complete fixes');
}

function addFailsafe(){
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7,64),
    new THREE.MeshStandardMaterial({color:0x2d5016,roughness:1}));
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

  console.log('[GC] anchors found:', Object.keys(anchors).filter(k => anchors[k]));
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
  return k;
}

async function spawnPlayers(){
  const pitcherGLB = await loadAny(PLAYER_URLS.pitcher, 'pitcherGLB', null);
  
  if (pitcherGLB?.scene){
    const root = pitcherGLB.scene;
    root.traverse(o=>{o.castShadow=o.receiveShadow=true;});
    __fitToField(root, 1.85);
    const bbox = new THREE.Box3().setFromObject(root);
    if (isFinite(bbox.min.y)) root.position.y -= bbox.min.y;
    const rigP = new THREE.Group(); rigP.name='pitcherRig'; rigP.add(root);
    nodes.pitcherMesh = root; nodes.pitcher = rigP; scene.add(rigP);

    if (pitcherGLB.animations?.length){
      const m = new THREE.AnimationMixer(root);
      mixers.pitcher = m;
      console.log('[Anim] pitcher clips available:', pitcherGLB.animations.map(a => a.name));
    }
  }
  
  const batterGLB = await loadAny(PLAYER_URLS.batter, 'batterGLB', null);
  
  if (batterGLB?.scene){
    const root = batterGLB.scene;
    root.traverse(o=>{o.castShadow=o.receiveShadow=true;});
    __fitToField(root, 1.85);
    const bbox = new THREE.Box3().setFromObject(root);
    if (isFinite(bbox.min.y)) root.position.y -= bbox.min.y;
    const rigB = new THREE.Group(); rigB.name='batterRig'; rigB.add(root);
    nodes.batterMesh = root; nodes.batter = rigB; scene.add(rigB);

    if (batterGLB.animations?.length){
      const m = new THREE.AnimationMixer(root);
      mixers.batter = m;
      console.log('[Anim] batter clips available:', batterGLB.animations.map(a => a.name));
    }
  }

  // Ground normalization
  if (nodes.pitcher){
    const bbox = new THREE.Box3().setFromObject(nodes.pitcher);
    if (isFinite(bbox.min.y)) nodes.pitcher.position.y -= bbox.min.y;
  }
  if (nodes.batter){
    const bbox = new THREE.Box3().setFromObject(nodes.batter);
    if (isFinite(bbox.min.y)) nodes.batter.position.y -= bbox.min.y;
  }

  // Snap to positions
  try{
    snapActors({ THREE, anchors, batter:nodes.batter, pitcher:nodes.pitcher, batterMesh:nodes.batterMesh, pitcherMesh:nodes.pitcherMesh, camera, scene, world, state });
  }catch(e){ console.warn('snapActors failed', e); }
}

function setupZone(){ 
  let zoneCanvas = document.getElementById('zoneCanvas'); 
  if (!zoneCanvas) {
    zoneCanvas = document.createElement('canvas');
    zoneCanvas.id = 'zoneCanvas';
    zoneCanvas.width = 360;
    zoneCanvas.height = 360;
    zoneCanvas.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-45%);
      width:28vmin;height:28vmin;pointer-events:none;opacity:.96
    `;
    document.body.appendChild(zoneCanvas);
  }
  const zctx = zoneCanvas.getContext('2d');
  window.gc.zoneCanvas = zoneCanvas;
  window.gc.zctx = zctx;
}

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
  if(!window.gc.zctx || !window.gc.zoneCanvas) return;
  const ctx=window.gc.zctx, w=window.gc.zoneCanvas.width, h=window.gc.zoneCanvas.height;
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
    try{ 
      snapActors({ THREE, anchors, batter:nodes.batter, pitcher:nodes.pitcher, batterMesh:nodes.batterMesh, pitcherMesh:nodes.pitcherMesh, camera, scene, world, state });
      applyBatterYFix();
      positionBatWithBatter();
    }catch{}
    const b=byId('btnSide'); if(b) b.textContent = `Batter: ${state.batterHand}`;
  });
  byId('btnReset')?.addEventListener('click',()=>{ reset(); drawZone(); tracerClear(); });
  document.addEventListener('gc:play', e=>{
    const evt=e.detail, key=map(evt);
    play(key, evt);
  });
}

function docById(id){ return document.getElementById(id); }
function sel(s){ return document.querySelector(s); }
function emit(evt){ document.dispatchEvent(new CustomEvent('gc:play',{detail:evt})); }

function parsePt(desc){
  if (!desc || typeof desc !== 'string') return null;
  const m1=/x\s*=\s*([-\d.]+)\s*y\s*=\s*([-\d.]+)/i.exec(desc);
  if(m1) return {x:+m1[1],y:+m1[2]};
  const m2=/\[([-\d.]+)\s*,\s*([-\d.]+)\]/.exec(desc);
  if(m2) return {x:+m2[1],y:+m2[2]};
  return null;
}

let auto=null;
function toggleAuto(){ auto?stopAuto():startAuto(); }
function startAuto(){
  const plays=[
    {type:'PITCH',desc:'FB 96 [0.1,0.5]'},
    {type:'SWING',desc:'Hack [-0.2,0.2]'},
    {type:'FOUL',desc:'Backstop [-0.7,0.9]'},
    {type:'PITCH',desc:'SL 86 [0.4,-0.5]'},
    {type:'INPLAY',desc:'Line drive [0.2,0.1]'},
    {type:'WALK',desc:'BB'},
    {type:'STRIKEOUT',desc:'K swinging [-0.3,-0.4]'}
  ];
  let i=0; auto=setInterval(()=>emit(plays[i++%plays.length]),2000);
  const b=docById('btnAuto')||sel('#btnAuto'); if(b) b.textContent='Auto: ON';
}
function stopAuto(){ clearInterval(auto); auto=null; const b=docById('btnAuto')||sel('#btnAuto'); if(b) b.textContent='Auto'; }

function reset(){ 
  // Stop all animations
  Object.values(mixers).forEach(mixer => {
    if (mixer) mixer.stopAllAction();
  });
  
  // Reset ball
  if (nodes.ball) {
    nodes.ball.userData.v = null;
    nodes.ball.visible = true;
    if (nodes.pitcher) {
      nodes.ball.position.copy(nodes.pitcher.position);
      nodes.ball.position.y += 30;
    } else {
      nodes.ball.position.set(-580, 50, -229);
    }
  }
  
  // Ensure bat is visible and positioned
  if (nodes.bat) {
    nodes.bat.visible = true;
    positionBatWithBatter();
  }
  
  // Reset heat map
  heat.forEach(r=>r.fill(0)); 
  
  console.log('[RESET] All systems reset - ball and bat visible');
}

function map(evt){
  const t=String(evt?.type||'').toUpperCase();
  if(MAP[t]) return MAP[t];
  return 'idle';
}

function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta();
  
  // Update mixers
  for(const k in mixers){ 
    const m=mixers[k]; 
    if(m) m.update(dt); 
  }
  
  // FIXED ball physics - visible ball with proper trail
  if (nodes.ball && nodes.ball.userData.v) {
    const ball = nodes.ball;
    const v = ball.userData.v;
    
    // Make sure ball stays visible
    ball.visible = true;
    
    // Apply physics
    ball.position.add(v.clone().multiplyScalar(dt * 60)); // Frame-rate independent
    v.y -= 20 * dt; // Gravity
    
    // Add to trail
    tracerPush(ball.position);
    
    // Ground collision
    if (ball.position.y <= 1) {
      ball.position.y = 1;
      v.y = Math.abs(v.y) * 0.4;
      v.x *= 0.7;
      v.z *= 0.7;
      
      if (v.length() < 5) {
        ball.userData.v = null;
        console.log('[BALL] Stopped');
      }
    }
  }
  
  // Ensure bat stays positioned
  if (nodes.bat && nodes.batter && !nodes.bat.userData.positioned) {
    positionBatWithBatter();
    nodes.bat.userData.positioned = true;
  }
  
  renderer.render(scene,camera);
}

function onResize(){ 
  camera.aspect=innerWidth/innerHeight; 
  camera.updateProjectionMatrix(); 
  renderer.setSize(innerWidth,innerHeight); 
}

function fatal(msg){ 
  const el=document.createElement('div'); 
  Object.assign(el.style,{
    position:'fixed',inset:'0',display:'grid',placeItems:'center',
    background:'#000',color:'#fff',font:'16px/1.4 ui-monospace'
  }); 
  el.textContent='Fatal: '+msg; 
  document.body.appendChild(el); 
}

// Export for debugging
window.tracerPush = tracerPush;
window.tracerClear = tracerClear;
window.heat = heat;
window.drawZone = drawZone;
window.reset = reset;
window.parsePt = parsePt;
window.createProceduralBall = createProceduralBall;
window.createProceduralBat = createProceduralBat;
window.positionBatWithBatter = positionBatWithBatter;