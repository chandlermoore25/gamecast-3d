// app.module.local.js — LOCAL ESM (anchors + player rehome + ball tracker + ingest)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL || './';


// ---------------- Config ----------------
const REAL_P2R = 18.44;          // meters home plate → rubber
const CATCHER_HEIGHT = 1.12;     // eye height above plate
const CATCHER_BACKOFF = 1.00;    // meters behind plate toward backstop

const PATHS = {
  field:  [BASE + 'Models/field.glb'],
  player: [BASE + 'Models/Player/body.glb', BASE + 'Models/body.glb', BASE + 'body.glb'],
  bat:    [BASE + 'Models/bat.glb'],
  ball:   [BASE + 'Models/baseball.glb'],
};


// Map live text → animation buckets (fallback by substring, case-insensitive)
const MAP = {
  PITCH:'pitch', STRIKE:'pitch',
  SWING:'swing', FOUL:'foul',
  INPLAY:'contact', CONTACT:'contact', SINGLE:'contact', DOUBLE:'contact', TRIPLE:'contact', HOMER:'contact', 'HOME RUN':'contact',
  WALK:'walk', BB:'walk', HBP:'walk',
  STRIKEOUT:'strikeout', 'K LOOKING':'strikeout', 'K SWINGING':'strikeout', DEFAULT:'idle'
};

// --------------- Globals ---------------
let scene, camera, renderer, clock, world;
let mixers={}, clips={}, nodes={};
let zoneCanvas, zctx, hudEl;
let anchors = { plate:null, rubber:null };
let helpers = { axes:null, plate:null, rubber:null };
let batterSide = 'R'; // or 'L'
const heat = Array.from({length:3},()=>[0,0,0]);

// --- Tracker + physics ---
let tracker = { enabled:true, line:null, points:[], max:80 };
const G  = -9.81; // m/s^2

// --------------- Boot ------------------
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
  camera.position.set(0,1.2,3.2); camera.lookAt(0,1.2,0);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(10,18,8); scene.add(sun);

  world = new THREE.Group();
  scene.add(world);
  addFailsafe();

  await Promise.allSettled([
    loadAny(PATHS.field,  'field',  g=>{ captureAnchors(g.scene); world.add(g.scene);}),
    loadAny(PATHS.player, 'player', g=>{ world.add(g.scene);}),
    loadAny(PATHS.bat,    'bat',    g=>{ g.scene.position.set(0.25,1.05,-0.35); g.scene.rotation.set(0,Math.PI*0.1,Math.PI*0.1); world.add(g.scene);}),
    loadAny(PATHS.ball,   'ball',   g=>{ g.scene.position.set(0,1.0,-1.6); world.add(g.scene);}),
  ]);

  calibrate();
  rehomePlayer(); // <- ensure batter is visible near the plate
  setupZone(); drawZone();
  addHUD('LOCAL ESM OK');
  wireUI();
  animate();

  // Debug shortcuts
  addEventListener('keydown', (e)=>{
    if(e.key==='h'||e.key==='H') toggleHelpers();
    if(e.key==='g'||e.key==='G') toggleAmbient();
    if(e.key==='c'||e.key==='C') cycleCams();
    if(e.key==='r'||e.key==='R') calibrate();
  });

  // Expose rich debug handle
  window.gc = { THREE, scene, camera, renderer, world, anchors, nodes, mixers, clips, tracker, ingestStatcast };
  console.log('[GC] debug handle set: window.gc');

  addEventListener('resize', onResize);
}

// ------------- Helpers / Scene ---------
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
        const dict={};
        for(const a of gltf.animations){ dict[a.name.toLowerCase()] = a; }
        clips[key]=dict;
      } else { mixers[key]=null; clips[key]={}; }
      onLoaded?.(gltf);
      console.log(`[GC] Loaded ${key}: ${url} | clips: ${gltf.animations?.map(a=>a.name).join(', ') || 'none'}`);
      return gltf;
    }catch(e){
      tried.push(url); lastErr = e;
    }
  }
  console.warn(`[GC] fail ${key} after trying: ${tried.join(', ')}`);
  if(lastErr) console.warn(lastErr);
  return null;
}

// ----------- Anchors (tolerant) --------
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

// --------------- Calibration -----------
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

// --------------- Player re-home --------
function rehomePlayer(){
  const pRoot = nodes.player;
  if(!pRoot) return;

  const box = new THREE.Box3().setFromObject(pRoot), sz = box.getSize(new THREE.Vector3());
  if (sz.y > 0) {
    const scale = 1.8 / sz.y;
    pRoot.scale.multiplyScalar(scale);
  }

  let base = new THREE.Vector3(0,0,0), dir = new THREE.Vector3(0,0,-1);
  if (anchors.plate && anchors.rubber){
    base.setFromMatrixPosition(anchors.plate.matrixWorld);
    const rub = new THREE.Vector3().setFromMatrixPosition(anchors.rubber.matrixWorld);
    dir.subVectors(rub, base).normalize();
  }
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const side = (batterSide==='R') ? 1 : -1;
  const offset = perp.multiplyScalar(0.9*side);
  const place = base.clone().add(offset).add(new THREE.Vector3(0,0,-0.6));

  pRoot.position.copy(place);
  const look = base.clone().add(dir.clone().multiplyScalar(10));
  pRoot.lookAt(look);
}

// --------------- Debug Helpers ----------
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

// --------------- Heatmap + HUD ----------
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

// --------------- UI & Anim -------------
function wireUI(){
  sel('#btnPitch')?.addEventListener('click',()=>{
    const mph = 92 + Math.random()*6;
    const nx = (Math.random()*2-1)*0.8;
    const ny = (Math.random()*2-1)*0.8;
    ingestStatcast({ mph, plate_x_ft: nx*0.708333, plate_z_ft: ny*((3.5-1.5)/2) + (1.5+3.5)/2, spin_rpm: 2000+Math.random()*600 });
  });
  sel('#btnAuto')?.addEventListener('click',toggleAuto);
  sel('#btnSide')?.addEventListener('click',()=>{
    batterSide = (batterSide==='R')?'L':'R';
    sel('#btnSide').textContent = `Batter: ${batterSide}`;
    rehomePlayer();
  });
  sel('#btnReset')?.addEventListener('click',()=>{ reset(); drawZone(); });
  document.addEventListener('gc:play', e=>{
    const evt=e.detail, key=map(evt);
    play(key, evt.opts||{});
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
    {type:'PITCH',desc:'FB 96 [0.1,0.5]', opts:{mph:96, targetX:0.1, targetY:0.5}},
    {type:'SWING',desc:'Hack [-0.2,0.2]'},
    {type:'FOUL',desc:'Backstop [-0.7,0.9]'},
    {type:'PITCH',desc:'SL 86 [0.4,-0.5]', opts:{mph:86, targetX:0.4, targetY:-0.5}},
    {type:'INPLAY',desc:'DOUBLE [0.2,0.1]'},
    {type:'WALK',desc:'BB'},
    {type:'STRIKEOUT',desc:'K swinging [-0.3,-0.4]'}
  ];
  let i=0; auto=setInterval(()=>emit(plays[i++%plays.length]),1500);
  sel('#btnAuto').textContent='Auto: ON';
}
function stopAuto(){ clearInterval(auto); auto=null; sel('#btnAuto').textContent='Auto'; }
function reset(){ play('idle'); heat.forEach(r=>r.fill(0)); }

// --- Player animation with tolerant mapping + physics triggers
function play(key='idle', opts={}){
  const pm=mixers.player, dict=clips.player||{}; // dict keys lowercased
  if(pm) pm.stopAllAction();

  const pick = (want)=> dict[want] ||
    Object.entries(dict).find(([k])=>k.includes(want))?.[1];

  let chosen=null;
  if(key==='swing')   chosen = pick('swing') || pick('hit');
  else if(key==='contact') chosen = pick('follow') || pick('hit') || pick('swing');
  else if(key==='idle')    chosen = pick('idle') || Object.values(dict)[0];
  else                     chosen = pick(key.toLowerCase());

  if(pm && chosen){ pm.clipAction(chosen).reset().fadeIn(0.08).play(); }

  const bat=nodes.bat, ball=nodes.ball;
  if(bat)  bat.rotation.set(0, Math.PI*0.1, Math.PI*0.1);
  if(ball) { ball.userData.v=null; touchTrail(true); }

  switch(key){
    case 'pitch': doPitch(opts); break;
    case 'contact':
      if(ball){ ball.userData.v=new THREE.Vector3(32, 20, -20).multiplyScalar(1/60); }
      break;
    case 'foul':
      if(ball){ ball.userData.v=new THREE.Vector3(-18, 14, -12).multiplyScalar(1/60); }
      break;
  }
}

// --------------- Ball physics -----------
function doPitch({ mph=95, targetX=0, targetY=0, spin_rpm=2200 }={}){
  const ball=nodes.ball; if(!ball) return;
  const ZW=0.4318, ZH=0.60;
  const targetLocal = new THREE.Vector3(targetX*(ZW/2), 1.5 + targetY*(ZH/2), 0);
  let plateW = new THREE.Vector3(), rubberW = new THREE.Vector3();
  if(anchors.plate && anchors.rubber){
    plateW.setFromMatrixPosition(anchors.plate.matrixWorld);
    rubberW.setFromMatrixPosition(anchors.rubber.matrixWorld);
    targetLocal.applyMatrix4(anchors.plate.matrixWorld);
  }
  const release = anchors.rubber ? rubberW.clone().add(new THREE.Vector3(0,1.8,0)) : new THREE.Vector3(-18.44,1.8,0);
  ball.position.copy(release);

  const speed = mph * 0.44704; // m/s
  const flat  = new THREE.Vector3().subVectors(targetLocal, release); flat.y=0;
  const horiz = flat.length() || 1e-6;
  const vdir  = flat.normalize();
  const vxz   = vdir.multiplyScalar(speed);
  const tFlight = horiz / speed;
  const vy = (targetLocal.y - release.y - 0.5*G*tFlight*tFlight) / tFlight;

  ball.userData.v = new THREE.Vector3(vxz.x, vy, vxz.z);
  ball.userData.spin_rps = spin_rpm/60;
  tracker.points.length = 0; touchTrail(true);
}

function touchTrail(reset=false){
  if (!tracker.enabled) return;
  if (!tracker.line) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent:true, opacity:0.8 });
    tracker.line = new THREE.Line(geo, mat);
    scene.add(tracker.line);
  }
  if(reset) tracker.points.length=0;
}
function updateTrail(pos){
  if (!tracker.enabled || !tracker.line) return;
  tracker.points.push(pos.clone());
  if (tracker.points.length > tracker.max) tracker.points.shift();
  tracker.line.geometry.setFromPoints(tracker.points);
}
function applyMagnus(v, spin_rps, dt){
  if(!spin_rps) return;
  const S = 0.0004 * spin_rps;              // tune
  const lift = new THREE.Vector3(-v.z, 0, v.x).multiplyScalar(S);
  v.addScaledVector(lift, dt);
}

// --------------- Animate ---------------
function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta();
  for(const k in mixers){ const m=mixers[k]; if(m) m.update(dt); }
  const ball=nodes.ball;
  if(ball && ball.userData.v){
    const v=ball.userData.v;
    applyMagnus(v, ball.userData.spin_rps, dt);
    ball.position.addScaledVector(v, dt);
    v.y += G * dt;
    if(ball.position.y<0.02){
      ball.position.y=0.02;
      v.y=Math.abs(v.y)*0.35; v.x*=0.85; v.z*=0.85;
      if(v.length()<0.8) ball.userData.v=null;
    }
    updateTrail(ball.position);
  }
  renderer.render(scene,camera);
}

function onResize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); drawZone(); }

// --------------- Data ingest -----------
function ingestStatcast({ mph, plate_x_ft, plate_z_ft, sz_bot_ft=1.5, sz_top_ft=3.5, spin_rpm=2200 }){
  const nx = Math.max(-1, Math.min(1, plate_x_ft / 0.708333));              // half-width ~0.708 ft
  const mid = (sz_bot_ft + sz_top_ft)/2, half=(sz_top_ft - sz_bot_ft)/2||1;  // normalize vertical
  const ny = Math.max(-1, Math.min(1, (plate_z_ft - mid)/half ));
  bumpHeatAt(nx, ny); drawZone();
  play('pitch', { mph, targetX:nx, targetY:ny, spin_rpm });
}

// --------------- Fatal -----------------
function fatal(msg){
  const el=document.createElement('div');
  Object.assign(el.style,{position:'fixed',inset:'0',display:'grid',placeItems:'center',background:'#000',color:'#fff',font:'16px/1.4 ui-monospace'});
  el.textContent='Fatal: '+msg; document.body.appendChild(el);
}
