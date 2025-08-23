
// menu.layer.js — Main Menu Overlay for GameCast
// Creates a baseball-themed overlay with 3 modes: REWIND, LIVE, PLAY.
// Wires into existing stream.client.js controls and manualControls test panel.

(function(){
  'use strict';

  const NS = '[MENU]';
  const log = (...a)=>console.log(NS, ...a);

  // -------- Styles --------
  function injectStyles(){
    if (document.getElementById('gc_menu_styles')) return;
    const css = `
      #gc_menu_overlay{
        position:fixed; inset:0;
        display:flex; align-items:center; justify-content:center;
        background: radial-gradient(120% 120% at 50% 0%, rgba(10,31,40,.96) 0%, rgba(0,0,0,.93) 55%);
        z-index: 100;
      }
      #gc_menu_card{
        width:min(720px, 92vw);
        padding:28px;
        border-radius:16px;
        border:1px solid #114052;
        background:linear-gradient(180deg, rgba(8,26,34,.85), rgba(6,20,26,.85));
        box-shadow: 0 10px 40px rgba(0,0,0,.6), inset 0 0 80px rgba(15,80,100,.12);
        color:#cfefff;
        font-family:-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      #gc_menu_title{
        display:flex; align-items:center; gap:12px;
        font-size:22px; font-weight:700; letter-spacing:.3px;
        margin-bottom:14px;
      }
      #gc_menu_sub{ opacity:.8; font-size:13px; margin-bottom:18px; }
      .gc_menu_row{ display:flex; gap:12px; flex-wrap:wrap; }
      .gc_btn{
        flex:1 1 180px;
        padding:16px 18px;
        border-radius:12px;
        border:1px solid #13475a;
        background:#0b2631;
        color:#cfefff;
        cursor:pointer;
        font-weight:600;
        font-size:16px;
        transition: transform .08s ease, background .2s ease, box-shadow .2s ease;
      }
      .gc_btn:hover{ background:#0e3240; transform: translateY(-1px); }
      .gc_btn:active{ transform: translateY(0); }
      .gc_mode_hint{ margin-top:14px; font-size:12px; opacity:.8; }
      .gc_field{
        display:flex; gap:10px; align-items:center; margin:12px 0 0;
      }
      .gc_input, .gc_select{
        padding:10px 12px; border-radius:10px; border:1px solid #123847;
        background:#06141a; color:#bfefff; outline:none; min-width: 200px;
      }
      .gc_small{ font-size:12px; opacity:.9; }
      #gc_menu_close{
        position:absolute; right:14px; top:10px; border:none; background:transparent; color:#9fdcff;
        font-size:20px; cursor:pointer; padding:6px 8px; border-radius:8px;
      }
      #gc_menu_close:hover{ background:rgba(159,220,255,.12); }
      #gc_menu_hint_bar{ margin-top:16px; padding:10px 12px; border:1px dashed #1a4757; border-radius:10px; background:rgba(6,20,26,.6); }
      #gc_menu_toggle{
        position: absolute; left: 10px; bottom: 10px;
        z-index: 15; border:1px solid #123847; border-radius:10px; padding:6px 10px;
        background:#0a1f28; color:#bfefff; cursor:pointer;
      }
      #gc_menu_toggle:hover{ background:#0d2a36; }
    `;
    const style = document.createElement('style');
    style.id = 'gc_menu_styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -------- DOM Builders --------
  function make(tag, attrs={}, html=''){
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    if (html) el.innerHTML = html;
    return el;
  }

  function ensureToggle(){
    if (document.getElementById('gc_menu_toggle')) return;
    const btn = make('button', { id:'gc_menu_toggle' }, '☰ Menu');
    btn.addEventListener('click', () => {
      showOverlay('root');
    });
    document.body.appendChild(btn);
  }

  function showOverlay(mode){
    injectStyles();
    let root = document.getElementById('gc_menu_overlay');
    if (!root){
      root = make('div', { id:'gc_menu_overlay' });
      document.body.appendChild(root);
    }
    root.innerHTML = '';

    const card = make('div', { id:'gc_menu_card' });
    root.appendChild(card);

    const title = make('div', { id:'gc_menu_title' }, `
      <span style="font-size:28px">⚾</span>
      <span>GameCast 3D</span>
    `);
    const close = make('button', { id:'gc_menu_close', title:'Close' }, '✕');
    close.onclick = ()=>{ root.remove(); };
    card.appendChild(close);
    card.appendChild(title);
    card.appendChild(make('div', { id:'gc_menu_sub' }, 'Choose a mode to get started. You can open this menu anytime from the bottom-left “Menu” button.'));

    const row = make('div', { className:'gc_menu_row' });
    const btnRewind = make('button', { className:'gc_btn', id:'gc_btn_rewind' }, '⏪ Game Re‑wind');
    const btnLive   = make('button', { className:'gc_btn', id:'gc_btn_live' },   '🟢 Live');
    const btnPlay   = make('button', { className:'gc_btn', id:'gc_btn_play' },   '🎮 Play');
    row.append(btnRewind, btnLive, btnPlay);
    card.appendChild(row);
    card.appendChild(make('div', { className:'gc_mode_hint' }, 'Re‑wind: pick a date & game • Live: today’s slate • Play: local test sandbox'));

    // Wiring
    btnPlay.onclick = () => {
      log('Play mode selected');
      if (window.streamMode) window.streamMode.set('db');
      if (window.streamMode) window.streamMode.set('db');
      try {
        document.getElementById('gc_menu_overlay')?.remove();
        ensureToggle();
        // Manually ensure manual controls are visible/initialized
        if (window.createManualControls) window.createManualControls();
      } catch(e){ console.warn(NS, 'Play error', e); }
    };

    btnRewind.onclick = () => { if (window.streamMode) window.streamMode.set('db');
      if (window.streamMode) window.streamMode.set('db');
      buildRewind(card); };
    btnLive.onclick   = () => { if (window.streamMode) window.streamMode.set('live');
      buildLive(card); };
  }

  // -------- Mode Builders --------
  function buildRewind(card){
    log('Building Rewind panel');
    card.innerHTML = '';
    const header = make('div', { id:'gc_menu_title' }, `<span style="font-size:28px">📅</span> <span>Re‑wind — pick a date</span>`);
    card.appendChild(header);
    const field = make('div', { className:'gc_field' });
    const input = make('input', { className:'gc_input', id:'menu_date', type:'date' });
    input.value = new Date(Date.now() - 24*3600*1000).toISOString().slice(0,10);
    const go = make('button', { className:'gc_btn', id:'menu_load' }, 'Load Games');
    field.append(input, go);
    card.appendChild(field);
    card.appendChild(make('div', { id:'gc_menu_hint_bar', className:'gc_small' }, 'After loading, select a game from the top‑left controls and press “Connect”.'));

    go.onclick = () => {
      const date = input.value;
      log('Rewind -> date chosen', date);
      try {
        // Ensure stream controls exist
        ensureStreamControls();
        // Set date & click load
        const di = document.getElementById('gc_date');
        const loadBtn = document.getElementById('gc_load');
        if (di && loadBtn){
          di.value = date;
          loadBtn.click();
          log('Triggered stream load for', date);
          // Keep the overlay but allow user to close
          ensureToggle();
          card.appendChild(make('div', { className:'gc_mode_hint' }, 'Select a game from the “Games” dropdown, then press “Connect”.'));
        } else {
          log('WARN gc_date or gc_load missing');
        }
      } catch(e){ console.warn(NS, 'Rewind trigger error', e); }
    };

    const back = make('button', { className:'gc_btn gc_small', style:'margin-top:12px' }, '← Back');
    back.onclick = () => showOverlay('root');
    card.appendChild(back);
  }

  function buildLive(card){
    log('Building Live panel');
    card.innerHTML = '';
    const header = make('div', { id:'gc_menu_title' }, `<span style="font-size:28px">🟢</span> <span>Live — today’s games</span>`);
    card.appendChild(header);
    const go = make('button', { className:'gc_btn', id:'menu_live_go' }, 'Load Today');
    card.appendChild(go);
    card.appendChild(make('div', { id:'gc_menu_hint_bar', className:'gc_small' }, 'Pick a game from the “Games” dropdown, then press “Connect”.'));

    go.onclick = () => {
      const today = new Date().toISOString().slice(0,10);
      log('Live -> load today', today);
      try {
        ensureStreamControls();
        const di = document.getElementById('gc_date');
        const loadBtn = document.getElementById('gc_load');
        if (di && loadBtn){
          di.value = today;
          loadBtn.click();
          log('Triggered stream load for today');
          ensureToggle();
        } else {
          log('WARN gc_date or gc_load missing');
        }
      } catch(e){ console.warn(NS, 'Live trigger error', e); }
    };

    const back = make('button', { className:'gc_btn gc_small', style:'margin-top:12px' }, '← Back');
    back.onclick = () => showOverlay('root');
    card.appendChild(back);
  }

  // Ensure stream controls exist (injected by stream.client.js)
  function ensureStreamControls(){
    const wrap = document.getElementById('streamControls');
    if (wrap) return true;
    // attempt to create by calling its injector if available
    // stream.client.js adds controls on window load automatically;
    // if user loaded menu super early, try re-dispatching a load event.
    window.dispatchEvent(new Event('load'));
    return !!document.getElementById('streamControls');
  }


// ---- DEMO generator (frontend-only) ----
const DEMO = (function(){
  let timer = null, count = 0, inning = 1, half = 'top', outs = 0, balls = 0, strikes = 0;
  function start(){
    stop();
    count = 0; inning = 1; half = 'top'; outs = 0; balls = 0; strikes = 0;
    timer = setInterval(()=>{
      count++;
      const mph = 92 + (count % 6);
      const ev = {
        event: 'pitch',
        gamePk: 999999,
        ts: new Date().toISOString(),
        inning, half, outs,
        count: { balls, strikes },
        pitch: { number: count, type: 'Fastball', mph, outcome: (strikes<2?'Called Strike':'In play, out(s)'), loc: { px: 0.1, pz: 2.6 } },
        bases: { onFirst: false, onSecond: false, onThird: false },
        atBatIndex: Math.floor(count/5),
        idempotencyKey: 'demo-'+count
      };
      document.dispatchEvent(new CustomEvent('gc:play', { detail: ev }));
      if (strikes < 2) { strikes++; } else { strikes = 0; balls = 0; outs++; }
      if (outs >= 3) { outs = 0; half = (half==='top'?'bottom':'top'); inning += (half==='top')?1:0; }
    }, 800);
    console.log('[MENU] DEMO started');
  }
  function stop(){ if (timer) { clearInterval(timer); timer = null; } }
  return { start, stop };
})();
window.gcDemo = DEMO;

  // Start overlay on first load
  function boot(){
    injectStyles();
    ensureToggle();
    showOverlay('root');
    log('Overlay initialized');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }


document.addEventListener('gc:backend-missing', (e)=>{
  const det = e.detail || {};
  console.warn('[MENU] Backend missing:', det);
  const root = document.getElementById('gc_menu_overlay') || (function(){ injectStyles(); const r = document.createElement('div'); r.id='gc_menu_overlay'; document.body.appendChild(r); return r; })();
  const card = document.createElement('div'); card.id='gc_menu_card';
  root.innerHTML = ''; root.appendChild(card);
  card.innerHTML = `
    <div id="gc_menu_title"><span style="font-size:28px">🖥️</span><span>Local backend not running</span></div>
    <div id="gc_menu_sub">Play/Re-wind (DB mode) needs your local server at <code>http://localhost:8000</code>.</div>
    <div class="gc_menu_row" style="margin-top:8px">
      <button class="gc_btn" id="gc_btn_demo">Start Demo (no server)</button>
      <button class="gc_btn" id="gc_btn_liveinstead">Switch to Live</button>
      <button class="gc_btn" id="gc_btn_retry">Retry</button>
    </div>
    <div class="gc_mode_hint">Open a terminal in <code>/backend</code> and run <code>uvicorn fastapi_app:app --host 0.0.0.0 --port 8000 --reload</code>.</div>
  `;
  card.querySelector('#gc_btn_demo').onclick = ()=>{ if (window.streamMode) window.streamMode.set('db'); DEMO.start(); root.remove(); };
  card.querySelector('#gc_btn_liveinstead').onclick = ()=>{ if (window.streamMode) window.streamMode.set('live'); showOverlay('root'); };
  card.querySelector('#gc_btn_retry').onclick = async ()=>{ if (window.streamBackend) { const ok = await window.streamBackend.ensureBackend('db'); if (ok) root.remove(); } };
});

  // Expose for debugging
  window.gcMenu = { show: ()=>showOverlay('root') };
})();
