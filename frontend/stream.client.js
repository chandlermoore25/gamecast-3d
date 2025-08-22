// stream.client.js — Unified Live/Replay client with strong debug logs
// - Live: WebSocket first, SSE tail fallback
// - Replay: SSE with pacing, supports start and speed
// - Emits gc:play events the renderer already consumes
// - Provides a tiny API used by the wizard UI
(() => {
  'use strict';
  const DEFAULT_BACKENDS = [
    'http://localhost:8000',
    'https://gamecast-3d.onrender.com'
  ];

  let ws = null, es = null;
  let connected = false;
  let backend = DEFAULT_BACKENDS[0];
  let mode = 'auto';       // 'auto' | 'live' | 'replay'
  let speed = 1;           // 1,2,4...
  let start = 'begin';     // 'begin' | 'tail' | '<pitchNumber>'
  let currentGamePk = null;
  let lastKey = null;

  const log = (...a) => console.log('[STREAM]', ...a);

  // ---------- Helpers
  const toWS = (url) => url.replace(/^http/, 'ws');
  const safeClose = () => {
    try { ws && ws.close(); } catch {}
    try { es && es.close && es.close(); } catch {}
    ws = null; es = null; connected = false;
  };

  function inferType(ev){
    const out = (ev?.pitch?.outcome || '').toLowerCase();
    if (/hit by pitch|walk/.test(out)) return 'WALK';
    if (/strikeout|k looking|k swinging/.test(out)) return 'STRIKEOUT';
    if (/home run/.test(out)) return 'HOMERUN';
    if (/single|double|triple/.test(out)) return 'HIT';
    if (/foul/.test(out)) return 'FOUL';
    if (/strike/.test(out)) return 'STRIKE';
    if (/ball/.test(out)) return 'BALL';
    return ev?.type || 'PITCH';
  }

  function toAnimEvent(ev){
    const px = ev?.location?.x ?? ev?.px ?? 0;
    const pz = ev?.location?.z ?? ev?.pz ?? 2.5;
    const velocity = ev?.velocity ?? 95;
    const type = inferType(ev);
    const desc = ev?.description || `${type} [${px.toFixed?.(2) ?? px}, ${pz.toFixed?.(2) ?? pz}]`;
    return {
      type,
      desc,
      raw: ev,
      animation: {
        triggerPitcher: type === 'PITCH' || /pitch/i.test(type),
        triggerBatter : /swing|contact|homerun|hit/i.test(type),
        ballPhysics: { enabled: true, velocity, location: { x: px, z: pz } }
      }
    };
  }

  function dispatchPlay(ev){
    const enhancedEvent = toAnimEvent(ev);
    document.dispatchEvent(new CustomEvent('gc:play', { detail: enhancedEvent }));
    log('▶', ev.idempotencyKey || ev.seq || 'n/a', enhancedEvent.type, enhancedEvent.desc);
  }

  function reduce(ev, opts = {}){
    if (!ev) return;
    const idKey = ev.idempotencyKey ?? ev.seq ?? `${ev.gamePk || currentGamePk}-${ev.ts || Date.now()}`;
    if (lastKey && idKey <= lastKey) { log('skip dup', idKey); return; }
    // Optional replay filters (inning / half / fromPitch)
    if (opts.filter) {
      const f = opts.filter;
      if (typeof f.fromPitch === 'number' && (ev.pitchNumber ?? 0) < f.fromPitch) return;
      if (f.inning && (ev.inningNumber ?? 0) < f.inning) return;
      if (f.half && (ev.inningHalf || '').toLowerCase() !== f.half) return;
    }
    lastKey = idKey;
    dispatchPlay(ev);
    // HUD hook
    try {
      const el = document.getElementById('hud-live');
      if (el) {
        const t = ev?.gameTime || ev?.ts || new Date().toISOString();
        el.textContent = `Live MLB Stats — Pitches: ${ev.pitchCount ?? '?'}  Strikes: ${ev.strikes ?? '?'}  Velocity: ${ev.velocity ?? '?'} mph  Time: ${t}`;
      }
    } catch {}
  }

  // ---------- Public API
  async function listBackends(){ return DEFAULT_BACKENDS.slice(); }
  function setBackend(url){ backend = url; log('Backend set:', backend); }
  function setMode(m){ mode = m; log('Mode set:', mode); }
  function setSpeed(v){ speed = v; log('Speed set:', speed); }
  function setStart(v){ start = v; log('Start set:', start); }

  async function loadGames(dateStr){
    const url = `${backend}/api/games?date=${encodeURIComponent(dateStr)}`;
    log('Loading games from:', url);
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('games list http ' + r.status);
    const data = await r.json();
    log('Loaded games:', data?.length || 0);
    return data || [];
  }

  function connect(opts = {}){
    const { gamePk, replayFilter } = opts;
    currentGamePk = gamePk ?? currentGamePk;
    if (!currentGamePk) { log('❌ No gamePk provided'); return; }
    lastKey = null;
    safeClose();

    const now = new Date();
    const isToday = (d => {
      try { const dt = new Date(d); return dt.toDateString() === now.toDateString(); }
      catch { return true; }
    })(opts.date || now);

    // Auto resolve: replay for past days; live for today
    const resolvedMode = (mode === 'auto') ? (isToday ? 'live' : 'replay') : mode;
    log(`Connecting: gamePk=${currentGamePk} mode=${resolvedMode} start=${start} speed=${speed}`);

    if (resolvedMode === 'replay'){
      const params = new URLSearchParams({ gamePk: String(currentGamePk), mode: 'replay', start: String(start), speed: String(speed) });
      const url = `${backend}/sse/stream?${params}`;
      log('SSE replay →', url);
      es = new EventSource(url, { withCredentials: false });
      es.onmessage = (e)=>{
        try {
          const ev = JSON.parse(e.data);
          reduce(ev, { filter: replayFilter });
        } catch (err) { log('Bad SSE JSON', err, e.data); }
      };
      es.onerror = (e)=>{ log('❌ SSE error', e); };
      es.onopen  = ()=>{ connected = true; log('✅ SSE connected'); document.dispatchEvent(new Event('gc:connected')); };
      return;
    }

    // Live: WS first, SSE tail fallback
    const wsURL = `${toWS(backend)}/ws/game/${currentGamePk}`;
    log('WS connecting →', wsURL);
    ws = new WebSocket(wsURL);
    ws.onopen = ()=>{ connected = true; log('✅ WS connected'); document.dispatchEvent(new Event('gc:connected')); };
    ws.onclose = ()=>{ connected = false; log('WS closed; falling back to SSE tail'); tailSSE(); };
    ws.onerror = (e)=>{ log('❌ WebSocket error:', e); try { ws.close(); } catch {}; };
    ws.onmessage = (m)=>{
      try { const ev = JSON.parse(m.data); reduce(ev); }
      catch (err) { log('Bad WS JSON', err, m.data); }
    };
  }

  function tailSSE(){
    const url = `${backend}/sse/stream?gamePk=${encodeURIComponent(currentGamePk)}`;
    log('SSE tail →', url);
    es = new EventSource(url, { withCredentials: false });
    es.onmessage = (e)=>{
      try { const ev = JSON.parse(e.data); reduce(ev); }
      catch (err) { log('Bad SSE JSON', err, e.data); }
    };
    es.onerror = (e)=>{ log('❌ SSE error', e); };
    es.onopen  = ()=>{ connected = true; log('✅ SSE connected'); document.dispatchEvent(new Event('gc:connected')); };
  }

  function disconnect(){
    safeClose();
    document.dispatchEvent(new Event('gc:disconnected'));
    log('Disconnected');
  }

  function cleanup(){ disconnect(); }

  // Inject tiny HUD if missing
  function ensureHUD(){
    if (document.getElementById('hud-live')) return;
    const el = document.createElement('div');
    el.id = 'hud-live';
    el.style.cssText = 'position:fixed;right:16px;top:12px;color:#9fe;z-index:60;font:12px/1.3 monospace;';
    el.textContent = 'Live MLB Stats: standby';
    document.body.appendChild(el);
  }

  window.addEventListener('DOMContentLoaded', ensureHUD);

  // Expose API
  window.streamClient = {
    listBackends,
    setBackend, setMode, setSpeed, setStart,
    loadGames,
    connect,
    disconnect,
    cleanup,
    isConnected: () => connected
  };
})();