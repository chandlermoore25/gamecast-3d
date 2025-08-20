// stream.client.js
// Connect to FastAPI WS/SSE and dispatch gc:play events that your 3D file already listens for.
// Verbose logs + simple UI injector so we don't have to edit your HTML much.

const API_BASE = localStorage.getItem('gc_api') || 'http://localhost:8000';
let ws = null, es = null, connected = false, lastKey = null;

function log(...a){ console.log('[STREAM]', ...a); }

function inferType(ev){
  const out = (ev?.pitch?.outcome || '').toLowerCase();
  if (/hit by pitch|walk/.test(out)) return 'WALK';
  if (/strikeout|k looking|k swinging/.test(out)) return 'STRIKEOUT';
  if (/foul/.test(out)) return 'FOUL';
  if (/in play|single|double|triple|home run|homer/.test(out)) return 'INPLAY';
  // default: treat any pitch as PITCH (also covers balls/called strikes)
  return 'PITCH';
}

function asDesc(ev){
  const mph = ev?.pitch?.mph ? Math.round(ev.pitch.mph) : '—';
  const px = ev?.pitch?.loc?.px, pz = ev?.pitch?.loc?.pz;
  const hasLoc = (typeof px === 'number' && typeof pz === 'number');
  return `${ev?.pitch?.type || 'Pitch'} ${mph}${typeof mph==='number'?' mph':''} ${hasLoc ? `[${(+px).toFixed(2)},${(+pz).toFixed(2)}]` : ''}`.trim();
}

function dispatchPlay(ev){
  const type = inferType(ev);
  const desc = asDesc(ev);
  document.dispatchEvent(new CustomEvent('gc:play', { detail: { type, desc, raw: ev } }));
  log('▶', ev.idempotencyKey, type, desc);
}

function reduce(ev){
  if (!ev || !ev.idempotencyKey) return;
  if (lastKey && ev.idempotencyKey <= lastKey) {
    log('skip dup', ev.idempotencyKey);
    return;
  }
  lastKey = ev.idempotencyKey;
  dispatchPlay(ev);
  // optional: update a tiny HUD
  const hud = document.getElementById('gc_hud') || injectHud();
  hud.textContent = `Inning ${ev.half || '?'} ${ev.inning || '?'} | Outs ${ev.outs ?? '?'} | Count ${ev.count?.balls ?? '?'}-${ev.count?.strikes ?? '?'}\n` +
                    `Pitch ${ev.pitch?.type || '?'} @ ${ev.pitch?.mph ? Math.round(ev.pitch.mph) : '—'} mph | key=${ev.idempotencyKey}`;
}

function injectHud(){
  const el = document.createElement('pre');
  el.id = 'gc_hud';
  Object.assign(el.style, {
    position:'absolute', right:'10px', top:'10px', zIndex:20,
    background:'rgba(0,0,0,.55)', color:'#bfefff', padding:'8px 10px',
    border:'1px solid #0a3a4a', borderRadius:'10px', font:'12px/1.3 ui-monospace', maxWidth:'42ch'
  });
  document.body.appendChild(el);
  return el;
}

function injectControls(){
  const ui = document.getElementById('ui') || (()=> {
    const d=document.createElement('div'); d.id='ui'; document.body.appendChild(d); return d;
  })();
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.innerHTML = `
    <input id="gc_api" placeholder="API base" style="width:200px" />
    <input id="gc_date" type="date" />
    <button id="gc_load">Games</button>
    <select id="gc_games" style="min-width:220px"></select>
    <button id="gc_connect">Connect</button>
  `;
  ui.appendChild(wrap);

  const api = document.getElementById('gc_api');
  api.value = localStorage.getItem('gc_api') || API_BASE;

  document.getElementById('gc_load').onclick = async ()=>{
    const base = (api.value||'').trim(); if(!base) return alert('API base?');
    localStorage.setItem('gc_api', base);
    const date = document.getElementById('gc_date').value || new Date().toISOString().slice(0,10);
    const url = `${base}/api/games?date=${date}`;
    log('GET', url);
    const res = await fetch(url); const games = await res.json();
    const sel = document.getElementById('gc_games'); sel.innerHTML = '';
    games.forEach(g=>{
      const opt = document.createElement('option');
      opt.value = g.gamePk; opt.textContent = `${g.away} @ ${g.home} — ${g.status}`;
      sel.appendChild(opt);
    });
  };

  document.getElementById('gc_connect').onclick = ()=>{
    const base = (api.value||'').trim(); if(!base) return alert('API base?');
    localStorage.setItem('gc_api', base);
    const gamePk = document.getElementById('gc_games').value;
    if(!gamePk) return alert('Pick a game');
    connectWS(base, gamePk);
  };
}

function connectWS(base, gamePk){
  cleanup();
  const url = `${base.replace(/^http/,'ws')}/ws/game/${gamePk}`;
  log('WS', url);
  ws = new WebSocket(url);
  let fellBack = false;
  ws.onopen = ()=>{ connected = true; log('ws open'); };
  ws.onmessage = (m)=>{ try{ reduce(JSON.parse(m.data)); }catch(e){ log('bad json', e); } };
  ws.onerror = (e)=>{ log('ws error', e); ws.close(); fallbackSSE(base, gamePk); fellBack=true; };
  ws.onclose = ()=>{ if(!fellBack) fallbackSSE(base, gamePk); };
  ws.onerror = (e) => {
  log('ws error', e);
  try { if (ws) ws.close(); } catch {}
  fallbackSSE(base, gamePk);
};

// add a safe cleanup()
function cleanup(){
  if (ws){ try { ws.close(); } catch {} ws = null; }
  if (es){ try { es.close(); } catch {} es = null; }
}
}

function fallbackSSE(base, gamePk){
  cleanup();
  const url = `${base}/sse/stream?gamePk=${gamePk}`;
  log('SSE', url);
  es = new EventSource(url);
  es.onmessage = (e)=>{ try{ reduce(JSON.parse(e.data)); }catch(err){ log('bad json', err); } };
  es.addEventListener('end', ()=>{ log('sse end'); es.close(); });
  es.onerror = (e)=>{ log('sse error', e); es.close(); };
}

function cleanup(){
  if(ws){ try{ ws.close(); }catch{} ws=null; }
  if(es){ try{ es.close(); }catch{} es=null; }
  connected = false; lastKey = null;
}

window.addEventListener('load', injectControls);
