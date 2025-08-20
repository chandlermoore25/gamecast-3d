// app.module.local.js — ORIGINAL + ONLY Y-AXIS FIX
// This is your exact working code with ONLY the batter Y-axis fix added

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { snapActors } from './tweaks.snapActors.js';

// expose THREE globally for non-module scripts
if (typeof window !== 'undefined') { window.THREE = THREE; }


// ---- URL resolver (EXACT COPY) ----
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

// ---- EARLY gc stub (EXACT COPY) ----
if (typeof window !== 'undefined') {
  window.gc = window.gc || {};
  window.gc.THREE = THREE;
  window.gc.anchors = window.gc.anchors || {};
  window.gc.nodes = window.gc.nodes || {};
  window.gc.state = window.gc.state || { batterHand: 'R' };
}

// ---- Helpers (EXACT COPY) ----
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

// ---- Ball tracer (EXACT COPY) ----
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

// ---- CONFIG (EXACT COPY) ----
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
  SWING:'swing', FOUL:'foul',
  INPLAY:'contact', CONTACT:'contact', SINGLE:'contact', DOUBLE:'contact', TRIPLE:'contact', HOMER:'contact', 'HOME RUN':'contact',
  WALK:'walk', BB:'walk', HBP:'walk',
  STRIKEOUT:'strikeout', 'K LOOKING':'strikeout', 'K SWINGING':'strikeout', DEFAULT:'idle'
};

// ---- Global variables (EXACT COPY) ----
let scene, camera, renderer, clock, world;
let mixers={}, clips={}, nodes={};
let anchors = {
  plate:null, rubber:null, pov:null,
  batterL_feet:null, batterR_feet:null, pitcher_feet:null
};

let __UNITS_PER_M = null;
let state = window.gc.state || { batterHand:'R' };
const heat = Array.from({length:3},()=>[0,0,0]);

// ---- ONLY Y-AXIS FIX ADDITION ----
function applyBatterYFix() {
  if (!nodes.batter || !nodes.batterMesh) return;
  
  const batterMesh = nodes.batterMesh;
  let footBones = [];
  
  // Find foot bones
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
      nodes.batter.position.y -= 0.02; // Slight settle
      console.log('[Y-Fix] Batter foot adjustment:', adjustment.toFixed(3));
    }
  }
}

// ---- HUD (EXACT COPY) ----
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
      el.textContent = `WORLD scale=${window.gc.world.scale.x.toFixed(3)}  bounds=${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)} + Y-fix`;
    }, 800);
  }catch(e){
    console.warn('[HUD] failed to create', e);
  }
}

// ---- Boot function (EXACT COPY + Y-fix) ----
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

  // Apply Y-fix ONCE after everything is loaded
  applyBatterYFix();

  // Kick any external listeners waiting for ready
  document.dispatchEvent(new CustomEvent('gc:ready', { detail:{ ready:true } }));

  setupZone(); drawZone();
  addHUD('ORIGINAL + Y-fix');
  wireUI();
  animate();

  addEventListener('resize', onResize);
}

// ---- ALL ORIGINAL FUNCTIONS (EXACT COPY) ----
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
    applyBatterYFix(); // Apply Y-fix after any resnap
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
      const clip = pickClip(pitcherGLB.animations, ['throw','pitch']);
      m.clipAction(clip).setLoop(THREE.LoopRepeat).play();
      console.log('[Anim] pitcher clip:', clip?.name);
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
    nodes.batterMesh = root; nodes.batter = rigB; nodes.player = rigB; scene.add(rigB);

    if (batterGLB.animations?.length){
      const m = new THREE.AnimationMixer(root);
      mixers.batter = m;
      const clip = pickClip(batterGLB.animations, ['swing','idle','hit','contact']);
      m.clipAction(clip).setLoop(THREE.LoopRepeat).play();
      console.log('[Anim] batter clip:', clip?.name);
    }
  }

  // Feet-on-ground normalization (based on bbox)
  if (nodes.pitcher){
    const bbox = new THREE.Box3().setFromObject(nodes.pitcher);
    if (isFinite(bbox.min.y)) nodes.pitcher.position.y -= bbox.min.y;
  }
  if (nodes.batter){
    const bbox = new THREE.Box3().setFromObject(nodes.batter);
    if (isFinite(bbox.min.y)) nodes.batter.position.y -= bbox.min.y;
  }

  // Anchor-driven placement (RUN ONLY ONCE)
  try{
    snapActors({ THREE, anchors, batter:nodes.batter, pitcher:nodes.pitcher, batterMesh:nodes.batterMesh, pitcherMesh:nodes.pitcherMesh, camera, scene, world, state });
  }catch(e){ console.warn('snapActors initial call failed', e); }
}

function pickClip(anims, keywords){
  const kw = keywords.map(s=>s.toLowerCase());
  const found = anims.find(a => kw.some(k => (a.name||'').toLowerCase().includes(k)));
  return found || anims[0];
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
      applyBatterYFix(); // Apply Y-fix after side switch
    }catch{}
    const b=byId('btnSide'); if(b) b.textContent = `Batter: ${state.batterHand}`;
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
function reset(){ play('idle'); heat.forEach(r=>r.fill(0)); }

function map(evt){
  const t=String(evt?.type||'').toUpperCase();
  if(MAP[t]) return MAP[t];
  return 'idle';
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