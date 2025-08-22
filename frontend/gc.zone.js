// gc.zone.js — Unified Strike Zone (heatmap + pitch dots) — FINAL
// - Renders a single canvas inside #strikeZoneOverlay
// - Exposes window.Zone API used by both index.html and app.module.local.js
// - Blends heat (3x3) + dot plotting using MLB px/pz
(function(){
  'use strict';
  const log = (...a)=>console.log('[ZONE]', ...a);
  const state = {
    heat: [[0,0,0],[0,0,0],[0,0,0]],
    dots: [],
    canvas: null,
    ctx: null,
    ready: false,
  };
  function init(){
    const overlay = document.getElementById('strikeZoneOverlay');
    if(!overlay){ setTimeout(init, 250); return; }
    const container = overlay.querySelector('.strike-zone-container') || overlay;

    // Remove any old DOM grid
    const grid = overlay.querySelector('#zoneGrid');
    if(grid && grid.parentNode){ grid.parentNode.removeChild(grid); }

    // Create/attach canvas
    let c = overlay.querySelector('#zoneCanvas');
    if(!c){
      c = document.createElement('canvas');
      c.id = 'zoneCanvas';
      c.width = 360; c.height = 540; // 2:3 aspect similar to ESPN box
      c.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-60%);width:300px;height:450px;pointer-events:none;z-index:50';
      container.appendChild(c);
    }
    state.canvas = c;
    state.ctx = c.getContext('2d');
    state.ready = true;

    // Bridge to legacy expectations from app.module.local.js
    window.gc = window.gc || {};
    window.gc.zoneCanvas = c;
    window.gc.zctx = state.ctx;

    draw();
    log('✅ Unified canvas ready');
  }

  function heatColor(v){
    // Blue -> Red; alpha scales with v (no fill at 0)
    const r = Math.round(255 * v);
    const g = Math.round(100 * v);
    const b = Math.round(255 * (1 - v));
    const a = Math.max(0, Math.min(0.75, v)); // up to 0.75 opacity
    return `rgba(${r},${g},${b},${a})`;
  }

  function bumpHeat(px, pz){
    // px ~ [-0.83, +0.83], pz approx [1.5, 3.5]
    const x = Math.max(-1, Math.min(1, px / 0.83));
    const y = Math.max(-1, Math.min(1, (pz - 2.5) / 1.0));
    const col = Math.min(2, Math.max(0, Math.floor((x + 1) / 2 * 3)));
    const row = Math.min(2, Math.max(0, Math.floor((1 - (y + 1) / 2) * 3)));
    state.heat[row][col] += 1;
  }

  function addPitchDot(data){
    // Expect {location:{x:px, z:pz}, pitchType, velocity}
    const { location, velocity, pitchType } = data || {};
    if(!location) return;
    const px = location.x ?? 0;
    const pz = location.z ?? 2.5;

    // Normalize into canvas coords
    const w = state.canvas.width, h = state.canvas.height;
    const m = 28, zx=m, zy=m, zw=w-2*m, zh=h-2*m;
    const xPercent = ((px + 0.83) / 1.66);
    const zPercent = ((3.5 - pz) / 2.0);
    const x = zx + Math.max(0.05, Math.min(0.95, xPercent)) * zw;
    const y = zy + Math.max(0.05, Math.min(0.95, zPercent)) * zh;

    const color = ({
      Fastball:'#ff4545', Slider:'#45a3ff', Curveball:'#a845ff', Changeup:'#ffc845'
    })[pitchType] || '#ffffff';

    state.dots.push({x, y, color, vel: velocity||0, t: performance.now()});
    if(state.dots.length > 30) state.dots.shift();
  }

  function clear(){
    state.heat = [[0,0,0],[0,0,0],[0,0,0]];
    state.dots = [];
    draw();
  }

  function draw(){
    if(!state.ready) return;
    const ctx = state.ctx, w=state.canvas.width, h=state.canvas.height;
    ctx.clearRect(0,0,w,h);
    const m=28, zx=m, zy=m, zw=w-2*m, zh=h-2*m;

    // Heat background
    const flat = state.heat.flat();
    const max = Math.max(1, ...flat);
    for(let r=0;r<3;r++){
      for(let c=0;c<3;c++){
        const v = state.heat[r][c] / max;
        if (v>0) { ctx.fillStyle = heatColor(v); ctx.fillRect(zx+c*(zw/3), zy+r*(zh/3), zw/3, zh/3); }
      }
    }

    // Box + grid
    ctx.fillStyle='rgba(10,20,40,0.15)'; ctx.fillRect(zx,zy,zw,zh);
    ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2; ctx.strokeRect(zx,zy,zw,zh);
    for(let i=1;i<3;i++){
      const gx=zx+i*(zw/3), gy=zy+i*(zh/3);
      ctx.beginPath(); ctx.moveTo(gx,zy); ctx.lineTo(gx,zy+zh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(zx,gy); ctx.lineTo(zx+zw,gy); ctx.stroke();
    }

    // Dots with fade
    const now = performance.now();
    for(const d of state.dots){
      const age = (now - d.t)/4000; // 4s fade
      const a = Math.max(0, 1 - age);
      ctx.fillStyle = d.color;
      ctx.globalAlpha = Math.max(0.25, a);
      ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Animation tick for redraws
  function tick(){ draw(); setTimeout(tick, 150); }

  // Public API
  window.Zone = {
    bumpHeat(px, pz){ bumpHeat(px, pz); },
    addPitch(p){ addPitchDot(p); bumpHeat(p?.location?.x ?? 0, p?.location?.z ?? 2.5); },
    draw,
    clear,
    heat: ()=>JSON.parse(JSON.stringify(state.heat)),
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else { init(); }
  tick();
})();