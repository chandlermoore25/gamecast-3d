// app.module.local.js — LOCAL ESM with anchors, debug helpers, and robust fallbacks
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


// --- LIVE BINDING FOR window.gc to avoid stale refs ---
let __gc_live = (typeof window !== 'undefined' && window.gc) ? window.gc : {};
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'gc', {
    configurable: true,
    get(){ return __gc_live; },
    set(v){ __gc_live = v || {}; }
  });
}
const gc = (typeof window !== 'undefined') ? window.gc : {};
const REAL_P2R = 18.44;
const CATCHER_HEIGHT = 1.10;
const CATCHER_BACKOFF = 1.00;

const PATHS = {
  field: ['Models/field.glb', './Models/field.glb', 'field.glb', './field.glb']
};

const PLAYER_URLS = {
  pitcher: 'Models/Player/pitcher_throwing.glb',
  batter:  'Models/Player/hitter_swing.glb'
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
let zoneCanvas, zctx, hudEl;
let anchors = { plate:null, rubber:null };
let helpers = { axes:null, plate:null, rubber:null };
const heat = Array.from({length:3},()=>[0,0,0]);

boot().catch(err=>fatal(err?.message || String(err)));

async function boot(){
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

  await Promise.allSettled([
    loadAny(PATHS.field, 'field',  g=>{ captureAnchors(g.scene); world.add(g.scene);})
  ]);


  calibrate();
  setupZone(); drawZone();
  addHUD('LOCAL ESM OK');
  wireUI();
  animate();

  window.addEventListener('keydown', (e)=>{
    if(e.key==='h'||e.key==='H') toggleHelpers();
    if(e.key==='g'||e.key==='G') toggleAmbient();
    if(e.key==='c'||e.key==='C') cycleCams();
    if(e.key==='r'||e.key==='R') calibrate();
  });

  window.gc = { THREE, scene, camera, renderer, world, anchors };
  console.log('[GC] debug handle set: window.gc');

  addEventListener('resize', onResize);
}

function addFailsafe(){
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7,64), new THREE.MeshStandardMaterial({color:0x5a4026,roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y=0; world.add(ground);
  const s = new THREE.Shape(); s.moveTo(-0.22,0); s.lineTo(0.22,0); s.lineTo(0.22,0.22); s.lineTo(0,0.44); s.lineTo(-0.22,0.22); s.closePath();
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9}));
  plate.rotation.x = -Math.PI/2; plate.position.set(0,0.01,0); world.add(plate);
}

async function loadAny(cands,key,onLoaded){
  const loader = new GLTFLoader();
  let lastErr=null, tried=[];
  for(const url of cands){
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
  anchors.plate  = findAny(root, ['PlateCenter','HomePlate','plate_center','platecenter','homeplate','plate']);
  anchors.rubber = findAny(root, ['RubberCenter','PitchersRubber','MoundCenter','rubbercenter','rubber','mound']);
  console.log('[GC] anchors:', { plate: !!anchors.plate, rubber: !!anchors.rubber });
}

function calibrate(){
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

    const p = new THREE.Vector3().setFromMatrixPosition(anchors.plate.matrixWorld);
    const r = new THREE.Vector3().setFromMatrixPosition(anchors.rubber.matrixWorld);
    const dir = new THREE.Vector3().subVectors(r, p).normalize();

    const back = dir.clone().multiplyScalar(-CATCHER_BACKOFF);
    const eye = p.clone().add(back).add(new THREE.Vector3(0, CATCHER_HEIGHT, 0));

    camera.near = 0.01; camera.far = 5000; camera.updateProjectionMatrix();
    camera.position.copy(eye);
    camera.lookAt(p.clone().add(dir.multiplyScalar(REAL_P2R*1.6)));
    console.log(`[GC] Calibrated (anchors).`);
    return;
  }

  const box = new THREE.Box3().setFromObject(world);
  const ctr = box.getCenter(new THREE.Vector3());
  world.position.sub(ctr);
  const sz = box.getSize(new THREE.Vector3());
  const radius = Math.max(sz.x, sz.z)*0.5 || 1;
  const scale = Math.min(1000, Math.max(0.001, REAL_P2R / radius));
  world.scale.setScalar(scale);
  camera.position.set(0, 1.15, 2.6);
  camera.lookAt(0, 1.2, -30);
  console.log(`[GC] Calibrated (fallback). bounds=${sz.x.toFixed(2)}x${sz.y.toFixed(2)}x${sz.z.toFixed(2)} scale=${scale.toFixed(3)}`);
}

function toggleAmbient(){
  const found = scene.children.find(n=>n.isAmbientLight);
  if(found){ scene.remove(found); } else{ scene.add(new THREE.AmbientLight(0xffffff, 0.7)); }
}
function toggleHelpers(){
  if(helpers.axes){
    scene.remove(helpers.axes); helpers.axes=null;
    if(helpers.plate){ scene.remove(helpers.plate); helpers.plate=null; }
    if(helpers.rubber){ scene.remove(helpers.rubber); helpers.rubber=null; }
    return;
  }
  helpers.axes = new THREE.AxesHelper(3); scene.add(helpers.axes);
  if(anchors.plate){
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.02,0.1), new THREE.MeshBasicMaterial({color:0x00ffff}));
    m.position.setFromMatrixPosition(anchors.plate.matrixWorld); scene.add(m); helpers.plate=m;
  }
  if(anchors.rubber){
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.02,0.1), new THREE.MeshBasicMaterial({color:0xff00ff}));
    m.position.setFromMatrixPosition(anchors.rubber.matrixWorld); scene.add(m); helpers.rubber=m;
  }
}
let camIdx=0;
function cycleCams(){
  const presets=[
    {pos:[0,1.10,1.6], look:[0,1.2,-18]},
    {pos:[0,1.15,2.6], look:[0,1.2,-30]},
    {pos:[0,1.25,3.6], look:[0,1.2,-40]},
  ];
  const p=presets[camIdx++%presets.length];
  camera.position.set(...p.pos);
  camera.lookAt(...p.look);
}

function setupZone(){
  zoneCanvas = document.getElementById('zoneCanvas');
  zctx = zoneCanvas.getContext('2d');
}
function drawZone(){
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
function addHUD(msg=''){
  const el=document.createElement('div');
  Object.assign(el.style,{position:'absolute',left:'10px',bottom:'10px',color:'#9fe5ff',font:'12px/1.3 ui-monospace, Menlo, Consolas',background:'rgba(0,0,0,.55)',padding:'8px 10px',border:'1px solid #0a3a4a',borderRadius:'10px',maxWidth:'44ch'});
  document.body.appendChild(el); hudEl=el;
  el.textContent=msg;
  setInterval(()=>{
    const b=new THREE.Box3().setFromObject(world);
    const s=new THREE.Vector3(); b.getSize(s);
    el.textContent=`WORLD pos=(${world.position.x.toFixed(2)}, ${world.position.y.toFixed(2)}, ${world.position.z.toFixed(2)})  scale=${world.scale.x.toFixed(3)}  bounds=${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)}`;
  }, 800);
}

function wireUI(){
  sel('#btnPitch')?.addEventListener('click',()=>emit({type:'PITCH',desc:'FB 95 [0.2,0.1]'}));
  sel('#btnAuto')?.addEventListener('click',toggleAuto);
  sel('#btnSide')?.addEventListener('click',flipBatter);
  sel('#btnReset')?.addEventListener('click',()=>{ reset(); drawZone(); });
  document.addEventListener('gc:play', e=>{
    const evt=e.detail, key=map(evt);
    play(key);
    const pt = parsePt(evt.desc) || {x:Math.random()*2-1, y:Math.random()*2-1};
    bumpHeatAt(pt.x, pt.y); drawZone();
  });
}
function sel(s){ return document.querySelector(s); }
function emit(evt){ document.dispatchEvent(new CustomEvent('gc:play',{detail:evt})); }
function parsePt(desc=''){ const m1=/x\s*=\s*([-\d.]+)\s*y\s*=\s*([-\d.]+)/i.exec(desc); if(m1) return {x:+m1[1],y:+m1[2]}; const m2=/\[([-\d.]+)\s*,\s*([-\d.]+)\]/.exec(desc); if(m2) return {x:+m2[1],y:+m2[2]}; }
function map(evt){
  const t=String(evt?.type||'').toUpperCase(), d=String(evt?.desc||'').toUpperCase();
  if(MAP[t]) return MAP[t];
  if(/STRIKEOUT|K LOOKING|K SWINGING/.test(d))return'strikeout';
  if(/\b(HR|HOMER|HOME RUN|SINGLE|DOUBLE|TRIPLE|IN PLAY)\b/.test(d))return'contact';
  if(/\bFOUL\b/.test(d))return'foul';
  if(/\b(WALK|BB|HBP)\b/.test(d))return'walk';
  if(/\bSWING\b/.test(d))return'swing';
  if(/\bPITCH|THROW\b/.test(d))return'pitch';
  return'idle';
}

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
  sel('#btnAuto').textContent='Auto: ON';
}
function stopAuto(){ clearInterval(auto); auto=null; sel('#btnAuto').textContent='Auto'; }
function reset(){ play('idle'); heat.forEach(r=>r.fill(0)); }
function flipBatter(){
  const r=nodes.player; if(!r) return;
  r.scale.x*=-1; const b=sel('#btnSide');
  if(b) b.textContent = `Batter: ${r.scale.x>0?'R':'L'}`;
}

function play(key='idle'){
  const pm=mixers.player, pc=clips.player||{}, bat=nodes.bat, ball=nodes.ball;
  if(pm) pm.stopAllAction();
  if(pm && pc[key]) pm.clipAction(pc[key]).reset().fadeIn(0.08).play();
  else if(pm && pc.idle && key==='idle') pm.clipAction(pc.idle).reset().play();

  if(bat){ bat.rotation.set(0,Math.PI*0.1,Math.PI*0.1); }
  if(ball){ ball.position.set(0,1.0,-1.6); ball.userData.v=null; }
  switch(key){
    case 'pitch': if(ball){ ball.userData.v=new THREE.Vector3(0,-0.02,0.065);} break;
    case 'swing': if(bat){ tween(bat.rotation,'z',bat.rotation.z,bat.rotation.z-Math.PI*0.8,220);} break;
    case 'contact': if(bat) tween(bat.rotation,'z',bat.rotation.z,bat.rotation.z-Math.PI*0.75,180); if(ball){ ball.userData.v=new THREE.Vector3(0.02,0.03,-0.02);} break;
    case 'foul': if(bat) tween(bat.rotation,'z',bat.rotation.z,bat.rotation.z-Math.PI*0.6,160); if(ball){ ball.userData.v=new THREE.Vector3(-0.02,0.02,-0.015);} break;
    case 'walk': if(bat){ tween(bat.rotation,'z',bat.rotation.z,bat.rotation.z-Math.PI*0.15,300); setTimeout(()=>tween(bat.rotation,'z',bat.rotation.z,bat.rotation.z+Math.PI*0.25,350),200);} break;
    case 'strikeout': if(bat){ tween(bat.position??(bat.position={x:bat.position.x,y:bat.position.y,z:bat.position.z}),'y',bat.position.y,bat.position.y-0.2,300);} break;
  }
}

function tween(obj,key,a,b,ms){
  const t0=performance.now();
  const step=t=>{ const p=Math.min(1,(t-t0)/ms); obj[key]=a+(b-a)*(1-Math.pow(1-p,3)); if(p<1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta();
  for(const k in mixers){ const m=mixers[k]; if(m) m.update(dt); }
  const ball=nodes.ball;
  if(ball && ball.userData.v){
    const v=ball.userData.v; ball.position.add(v); v.y-=0.0012;
    if(ball.position.y<0.02){ ball.position.y=0.02; v.y=Math.abs(v.y)*0.35; v.x*=0.8; v.z*=0.8; if(v.length()<0.002) ball.userData.v=null; }
  }
  renderer.render(scene,camera);
}

function onResize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); drawZone(); }

function fatal(msg){
  const el=document.createElement('div');
  Object.assign(el.style,{position:'fixed',inset:'0',display:'grid',placeItems:'center',background:'#000',color:'#fff',font:'16px/1.4 ui-monospace'});
  el.textContent='Fatal: '+msg; document.body.appendChild(el);
}


// ================== SPAWNER: pitcher + batter ==================
const __spawnLog = (...a)=>console.log('[SPAWN]', ...a);
const __waitFor = (fn, ms=15000)=>new Promise((res,rej)=>{const t0=performance.now();const id=setInterval(()=>{try{if(fn()){clearInterval(id);res(true);}else if(performance.now()-t0>ms){clearInterval(id);rej(new Error('timeout'));}}catch(e){clearInterval(id);rej(e)}},60);});
const __fitH = (obj, target=1.85)=>{const box=new THREE.Box3().setFromObject(obj);const size=box.getSize(new THREE.Vector3());const h=size.y||1;let k=target/h;if(!isFinite(k)||k<=0)k=1; k=Math.max(0.05, Math.min(20, k)); obj.scale.multiplyScalar(k); return k;};
const __feet = (obj)=>{const b=new THREE.Box3().setFromObject(obj); obj.position.y -= b.min.y;};
const __wpos = (o)=>o?new THREE.Vector3().setFromMatrixPosition(o.matrixWorld):null;
const __lookXZ = (obj, tgt)=>{const p=obj.position.clone(); const t=tgt.clone(); p.y=t.y=0; obj.lookAt(t);};
async function __loadGLB(u){return await new Promise((ok,ko)=>{new GLTFLoader().load(u, ok, undefined, ko);});}

async function __spawnAll(){
  await __waitFor(()=>scene && world);           // scene/world created
  await __waitFor(()=>anchors && (anchors.plate||anchors.rubber), 20000); // anchors captured after field load

  // Spawn pitcher
  try{
    const g = await __loadGLB(PLAYER_URLS.pitcher);
    const root = g.scene; root.traverse(o=>{o.castShadow=o.receiveShadow=true;});
    const scale = __fitH(root, 1.85); __feet(root);
    const rW = __wpos(anchors.rubber) || new THREE.Vector3(0,0,-18.44);
    root.position.copy(rW);
    const look = __wpos(anchors.plate) || rW.clone().add(new THREE.Vector3(0,0,10));
    __lookXZ(root, look);
    if (g.animations?.length){ const m=new THREE.AnimationMixer(root); m.clipAction(g.animations[0]).play(); mixers.pitcher=m; clips.pitcher=g.animations[0]; }
    nodes.pitcher = root; scene.add(root);
    const axes=new THREE.AxesHelper(0.8); root.add(axes);
    const box=new THREE.Box3().setFromObject(root); const helper=new THREE.Box3Helper(box,0xff00ff); scene.add(helper); setTimeout(()=>scene.remove(helper),5000);
    __spawnLog('pitcher ok scale', scale.toFixed(3), 'pos', root.position.toArray());
  }catch(e){ console.warn('pitcher load failed', e); }

  // Spawn batter (RHB default)
  try{
    const g = await __loadGLB(PLAYER_URLS.batter);
    const root = g.scene; root.traverse(o=>{o.castShadow=o.receiveShadow=true;});
    const scale = __fitH(root, 1.85); __feet(root);
    const pW = __wpos(anchors.plate) || new THREE.Vector3(0,0,0);
    root.position.set(pW.x + 0.85, 0, pW.z - 0.35);
    const look = __wpos(anchors.rubber) || pW.clone().add(new THREE.Vector3(0,0,10));
    __lookXZ(root, look);
    if (g.animations?.length){ const m=new THREE.AnimationMixer(root); m.clipAction(g.animations[0]).play(); mixers.batter=m; clips.batter=g.animations[0]; }
    nodes.batter = root; nodes.player = root; scene.add(root);
    const axes=new THREE.AxesHelper(0.8); root.add(axes);
    const box=new THREE.Box3().setFromObject(root); const helper=new THREE.Box3Helper(box,0x00ffff); scene.add(helper); setTimeout(()=>scene.remove(helper),5000);
    __spawnLog('batter ok scale', scale.toFixed(3), 'pos', root.position.toArray());
  }catch(e){ console.warn('batter load failed', e); }
}
__spawnAll().catch(e=>console.warn('spawn timeout', e));
