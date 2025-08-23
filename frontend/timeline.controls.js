
// timeline.controls.js — Timeline + Filters + Self-Test (cutscene-ready)
// Adds a compact HUD for controlling/reviewing the event flow without disrupting the existing stream.
// Everything here is additive; we DO NOT intercept or block gc:play. It’s a verification + trigger layer.

(function(){
  'use strict';
  const NS = '[TIMELINE]';
  const log = (...a)=>console.log(NS, ...a);

  // ---------------- State ----------------
  const state = {
    startedAt: null,
    lastEventAt: null,
    buffer: [],
    filters: { pitches:true, inplay:true, scoring:true },
    speed: 1.0,
    cut: { prePitch:true, contactZoom:true, flyTrack:true },
  };

  // Expose for debug
  window.gcTimeline = {
    get buffer(){ return state.buffer; },
    setFilters: (f)=>{ Object.assign(state.filters, f||{}); renderFilters(); },
    setSpeed: (v)=>{ state.speed = Math.max(.1, Math.min(4, +v||1)); ui.speed.value = String(state.speed); },
    setCuts: (c)=>{ Object.assign(state.cut, c||{}); renderCuts(); broadcastCuts(); },
    selfTest: runSelfTest,
  };

  // ---------------- UI ----------------
  const ui = {};
  function injectStyles(){
    if (document.getElementById('gc_timeline_styles')) return;
    const style = document.createElement('style');
    style.id = 'gc_timeline_styles';
    style.textContent = `
      #gc_tl{
        position:fixed; right:10px; top:10px; width:310px; z-index:60;
        background:rgba(6,20,26,.86); color:#cfefff;
        border:1px solid #123847; border-radius:12px; padding:10px 10px 8px;
        font:12px/1.2 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,.45);
      }
      #gc_tl .row{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; }
      #gc_tl h4{ margin:0 0 6px; font-size:13px; letter-spacing:.3px; }
      #gc_tl .tag{ padding:2px 8px; border-radius:999px; background:#0a1f28; border:1px solid #13475a; }
      #gc_tl button, #gc_tl input[type="range"]{ accent-color:#58b2de; }
      #gc_tl .btn{ padding:6px 10px; border:1px solid #13475a; border-radius:8px; background:#0b2631; color:#cfefff; cursor:pointer; }
      #gc_tl .btn:hover{ background:#0e3240; }
      #gc_tl .muted{ opacity:.8 }
      #gc_tl .grid{ display:grid; grid-template-columns:1fr 1fr; gap:6px; }
      #gc_tl .checks{ display:grid; grid-template-columns:auto 1fr auto 1fr; gap:6px 8px; align-items:center; }
      #gc_tl .bar{ height:6px; background:#0a1f28; border:1px solid #13475a; border-radius:8px; overflow:hidden; }
      #gc_tl .bar > div{ height:100%; background:#3aa2d8; width:0%; transition:width .2s ease; }
      #gc_tl .foot{ display:flex; justify-content:space-between; margin-top:6px; }
    `;
    document.head.appendChild(style);
  }

  function build(){
    if (document.getElementById('gc_tl')) return;
    const root = document.createElement('div');
    root.id = 'gc_tl';
    root.innerHTML = `
      <div class="row"><h4>Timeline • QA</h4><span class="tag" id="tl_ingest">Ingest: —</span></div>
      <div class="row">
        <div><span class="muted">Game clock:</span> <span id="tl_gclock">00:00</span></div>
        <div><span class="muted">Real:</span> <span id="tl_rclock">—</span></div>
      </div>
      <div class="row"><div class="bar"><div id="tl_bar"></div></div></div>

      <div class="row">
        <button class="btn" id="tl_prev">⟨ Prev</button>
        <button class="btn" id="tl_pause">⏸ Pause</button>
        <button class="btn" id="tl_play">▶ Play</button>
        <button class="btn" id="tl_next">Next ⟩</button>
      </div>

      <div class="row">
        <label class="muted">Speed</label>
        <input id="tl_speed" type="range" min="0.25" max="2" step="0.25" value="1">
        <span id="tl_speed_val" class="tag">1.0x</span>
      </div>

      <div class="row"><div class="muted">Filters</div><span id="tl_counts" class="tag">0 events</span></div>
      <div class="checks">
        <input id="tl_f_pitches" type="checkbox" checked><label for="tl_f_pitches">Pitches</label>
        <input id="tl_f_inplay" type="checkbox" checked><label for="tl_f_inplay">In‑Play</label>
        <input id="tl_f_scoring" type="checkbox" checked><label for="tl_f_scoring">Scoring</label>
      </div>

      <div class="row"><div class="muted">Cutscenes</div><span id="tl_cuts_tag" class="tag">auto</span></div>
      <div class="checks">
        <input id="tl_c_pre" type="checkbox" checked><label for="tl_c_pre">Pre‑pitch settle</label>
        <input id="tl_c_contact" type="checkbox" checked><label for="tl_c_contact">Contact zoom</label>
        <input id="tl_c_fly" type="checkbox" checked><label for="tl_c_fly">Fly‑ball track</label>
      </div>

      <div class="grid" style="margin-top:6px">
        <button class="btn" id="tl_self">Run Self‑Test</button>
        <button class="btn" id="tl_clear">Clear Buffer</button>
      </div>
      <div class="foot"><span id="tl_last" class="muted">Last: —</span><span id="tl_size" class="muted">Buf: 0</span></div>
    `;
    document.body.appendChild(root);

    ui.ingest = root.querySelector('#tl_ingest');
    ui.gclock = root.querySelector('#tl_gclock');
    ui.rclock = root.querySelector('#tl_rclock');
    ui.bar = root.querySelector('#tl_bar');
    ui.prev = root.querySelector('#tl_prev');
    ui.pause = root.querySelector('#tl_pause');
    ui.play = root.querySelector('#tl_play');
    ui.next = root.querySelector('#tl_next');
    ui.speed = root.querySelector('#tl_speed');
    ui.speedVal = root.querySelector('#tl_speed_val');
    ui.counts = root.querySelector('#tl_counts');
    ui.last = root.querySelector('#tl_last');
    ui.size = root.querySelector('#tl_size');

    // Filters
    ui.fP = root.querySelector('#tl_f_pitches');
    ui.fI = root.querySelector('#tl_f_inplay');
    ui.fS = root.querySelector('#tl_f_scoring');

    // Cuts
    ui.cPre = root.querySelector('#tl_c_pre');
    ui.cContact = root.querySelector('#tl_c_contact');
    ui.cFly = root.querySelector('#tl_c_fly');

    // Wire actions
    ui.prev.onclick = ()=>{ replayStep(-1); };
    ui.next.onclick = ()=>{ replayStep(1); };
    ui.pause.onclick = ()=>{ document.dispatchEvent(new CustomEvent('gc:pause', { detail: true })); ui.ingest.textContent = 'Ingest: paused'; };
    ui.play.onclick = ()=>{ document.dispatchEvent(new CustomEvent('gc:pause', { detail: false })); ui.ingest.textContent = 'Ingest: live'; };
    ui.speed.oninput = ()=>{ state.speed = +ui.speed.value; ui.speedVal.textContent = state.speed.toFixed(2)+'x'; document.dispatchEvent(new CustomEvent('gc:speed', { detail: state.speed })); };

    ui.fP.onchange = ()=>{ state.filters.pitches = ui.fP.checked; renderFilters(); };
    ui.fI.onchange = ()=>{ state.filters.inplay = ui.fI.checked; renderFilters(); };
    ui.fS.onchange = ()=>{ state.filters.scoring = ui.fS.checked; renderFilters(); };

    ui.cPre.onchange = ui.cContact.onchange = ui.cFly.onchange = ()=>{
      state.cut = { prePitch: ui.cPre.checked, contactZoom: ui.cContact.checked, flyTrack: ui.cFly.checked };
      broadcastCuts();
      renderCuts();
    };

    root.querySelector('#tl_self').onclick = runSelfTest;
    root.querySelector('#tl_clear').onclick = ()=>{ state.buffer.length = 0; renderCounts(); };

    setInterval(tickClocks, 500);
    renderAll();
  }

  function renderAll(){ renderCounts(); renderFilters(); renderCuts(); }
  function renderCounts(){
    ui.size.textContent = 'Buf: ' + state.buffer.length;
    ui.counts.textContent = `${state.buffer.length} events`;
  }
  function renderFilters(){
    // purely descriptive for now
    let tags = [];
    if (state.filters.pitches) tags.push('P');
    if (state.filters.inplay) tags.push('IP');
    if (state.filters.scoring) tags.push('R');
    ui.counts.textContent = `${state.buffer.length} events • ${tags.join('/')||'none'}`;
  }
  function renderCuts(){
    const on = Object.entries(state.cut).filter(([,v])=>v).map(([k])=>k);
    ui.cuts = ui.cuts || document.getElementById('tl_cuts_tag');
    ui.cuts.textContent = on.length ? on.length+' on' : 'off';
  }
  function tickClocks(){
    const now = new Date();
    ui.rclock.textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    if (!state.startedAt) return;
    const d = Math.floor((now - state.startedAt)/1000);
    const m = String(Math.floor(d/60)).padStart(2,'0');
    const s = String(d%60).padStart(2,'0');
    ui.gclock.textContent = `${m}:${s}`;
    const pct = Math.min(100, Math.floor((state.buffer.length % 100)/100*100));
    ui.bar.style.width = pct + '%';
  }

  // Broadcast current cutscene prefs to any camera/anim director
  function broadcastCuts(){
    document.dispatchEvent(new CustomEvent('gc:cutscene-config', { detail: {...state.cut} }));
  }

  // ---------------- Event intake ----------------
  document.addEventListener('gc:play', (e)=>{
    const ev = e.detail || {};
    if (!state.startedAt) state.startedAt = new Date();
    state.lastEventAt = new Date();
    // Buffer for replay/QA
    state.buffer.push(ev);
    ui.ingest.textContent = 'Ingest: live';
    ui.last.textContent = `Last: ${ev.event||'play'} • inn ${ev.game?.inning||ev.inning||'?'} ${ev.game?.half||ev.half||''}`;
    renderCounts();
  }, {capture:false});

  // ---------------- Replay (client-side) ----------------
  let replayIdx = -1;
  function replayStep(delta){
    if (!state.buffer.length) return;
    if (replayIdx < 0) replayIdx = state.buffer.length - 1;
    replayIdx = Math.max(0, Math.min(state.buffer.length - 1, replayIdx + delta));
    const ev = JSON.parse(JSON.stringify(state.buffer[replayIdx])); // clone
    ev.ts = new Date().toISOString();
    ev.idempotencyKey = 'replay-' + replayIdx + '-' + ev.idempotencyKey;
    log('Replaying idx', replayIdx, ev);
    document.dispatchEvent(new CustomEvent('gc:play', { detail: ev }));
  }

  // ---------------- Self test ----------------
  function runSelfTest(){
    log('Self-test start');
    const seq = [
      { t:0,    ev: mkPitch(1, 'Fastball', 95, 'Called Strike', 0.1, 2.8) },
      { t:600,  ev: mkPitch(2, 'Fastball', 96, 'Swinging Strike', -0.1, 2.6) },
      { t:1200, ev: mkPitch(3, 'Fastball', 97, 'In play, out(s)', 0.0, 2.4) },
      { t:2400, ev: mkPitch(1, 'Curveball', 82, 'Ball', 0.6, 3.8, { inning:1, half:'bottom', outs:0 }) },
      { t:3200, ev: mkPitch(2, 'Curveball', 83, 'In play, run(s)', -0.2, 2.7) },
    ];
    seq.forEach(s=>setTimeout(()=>{
      document.dispatchEvent(new CustomEvent('gc:play', { detail:s.ev }));
    }, s.t));
  }
  function mkPitch(n, type, mph, outcome, px, pz, overrides){
    const base = {
      event: 'pitch',
      gamePk: 999999,
      ts: new Date().toISOString(),
      inning: 1, half:'top', outs:0,
      count: { balls:0, strikes: Math.min(2, Math.floor(Math.random()*3)) },
      pitch: { number:n, type, mph, outcome, loc:{ px, pz }, zone:null },
      bases: { onFirst:false, onSecond:false, onThird:false },
      atBatIndex: 0,
      idempotencyKey: 'selftest-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)
    };
    return Object.assign(base, overrides||{});
  }

  // ---------------- Boot ----------------
  function boot(){
    try{
      injectStyles();
      build();
      broadcastCuts();
      log('Timeline HUD ready');
    }catch(err){ console.error(NS, 'init error', err); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
