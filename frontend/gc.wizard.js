// gc.wizard.js — Guided connection wizard with debug logs
(() => {
  'use strict';
  const log = (...a)=>console.log('[WIZARD]', ...a);

  function el(tag, attrs={}, children=[]){
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k==='style') n.style.cssText = v;
      else if (k.startsWith('on') && typeof v==='function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children){ if (typeof c==='string') n.appendChild(document.createTextNode(c)); else n.appendChild(c); }
    return n;
  }

  function overlay(){
    let wrap = document.getElementById('wizard');
    if (wrap) return wrap;
    wrap = el('div', { id:'wizard', style:`
      position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:100;
      display:flex; align-items:center; justify-content:center;` });
    const card = el('div', { style:`
      width:720px; max-width:92vw; background:#0d1323; color:#e8f1ff; border-radius:16px;
      box-shadow:0 10px 40px rgba(0,0,0,.5); padding:20px; font:14px/1.4 Inter,system-ui,sans-serif;`});
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    return wrap;
  }

  function close(){ const w = document.getElementById('wizard'); if (w) w.remove(); }

  async function open(){
    const w = overlay();
    const card = w.firstChild;
    card.innerHTML = '';
    card.appendChild(el('h2', {}, ['GameCast Connect Wizard']));
    const body = el('div', { style:'display:grid; gap:12px;'});

    // Step 1: backend
    const backends = await window.streamClient.listBackends();
    const selBackend = el('select', { id:'wiz-backend', style:'width:100%; padding:8px; border-radius:8px; background:#0b1a33; color:#bfe;'});
    backends.forEach(u => selBackend.appendChild(el('option', {}, [u])));

    // Step 2: date
    const date = new Date();
    const iso = date.toISOString().slice(0,10);
    const inputDate = el('input', { id:'wiz-date', type:'date', value:iso, style:'padding:8px;border-radius:8px;background:#0b1a33;color:#bfe;' });

    // Step 3: game list
    const selGame = el('select', { id:'wiz-game', style:'width:100%; padding:8px; border-radius:8px; background:#0b1a33; color:#bfe;' });
    const btnLoad = el('button', { style:'padding:8px 12px;border-radius:8px;background:#193b6a;color:#fff;' }, ['Load Games']);
    btnLoad.addEventListener('click', async () => {
      try {
        window.streamClient.setBackend(selBackend.value);
        const games = await window.streamClient.loadGames(inputDate.value);
        selGame.innerHTML='';
        games.forEach(g => {
          const label = `${g.away} @ ${g.home} — ${g.status || 'Final'} — ${g.gamePk}`;
          const opt = el('option', { value:String(g.gamePk) }, [label]);
          selGame.appendChild(opt);
        });
        log('Games loaded:', selGame.options.length);
      } catch (e) {
        console.error('[WIZARD] load games failed', e);
      }
    });

    // Step 4: mode/speed/start
    const selMode = el('select', { id:'wiz-mode', style:'padding:8px;border-radius:8px;background:#0b1a33;color:#bfe;' }, [
      el('option', { value:'auto' }, ['Auto']),
      el('option', { value:'replay' }, ['Replay']),
      el('option', { value:'live' }, ['Live']),
    ]);
    const selSpeed = el('select', { id:'wiz-speed', style:'padding:8px;border-radius:8px;background:#0b1a33;color:#bfe;' }, [
      el('option', { value:'1' }, ['1×']),
      el('option', { value:'2' }, ['2×']),
      el('option', { value:'4' }, ['4×']),
    ]);
    const selStart = el('select', { id:'wiz-start', style:'padding:8px;border-radius:8px;background:#0b1a33;color:#bfe;' }, [
      el('option', { value:'begin' }, ['Start of Game']),
      el('option', { value:'tail' }, ['Recent Pitches']),
      el('option', { value:'50' }, ['From Pitch #50']),
    ]);

    // Optional inning filter (client side skip until inning/half)
    const selInning = el('input', { id:'wiz-inning', type:'number', min:'1', max:'20', placeholder:'Inning (optional)', style:'padding:8px;border-radius:8px;background:#0b1a33;color:#bfe;' });
    const selHalf   = el('select', { id:'wiz-half', style:'padding:8px;border-radius:8px;background:#0b1a33;color:#bfe;' }, [
      el('option', { value:'' }, ['Any Half']),
      el('option', { value:'top' }, ['Top']),
      el('option', { value:'bot' }, ['Bottom']),
    ]);

    // Step 5: connect
    const btnConnect = el('button', { style:'padding:10px 14px;border-radius:8px;background:#28a745;color:#fff;font-weight:600;' }, ['Connect']);
    btnConnect.addEventListener('click', () => {
      const gamePk = selGame.value;
      if (!gamePk) { alert('Pick a game'); return; }
      window.streamClient.setBackend(selBackend.value);
      window.streamClient.setMode(selMode.value);
      window.streamClient.setSpeed(Number(selSpeed.value));
      window.streamClient.setStart(selStart.value);
      const filter = {};
      const inn = Number(selInning.value);
      if (inn>0) filter.inning = inn;
      const half = String(selHalf.value || '').trim();
      if (half) filter.half = half;
      window.streamClient.connect({ gamePk, date: inputDate.value, replayFilter: filter });
      log('Connecting with filter:', filter);
      close();
    });

    const row = (label, node) => el('div', { style:'display:grid;grid-template-columns:180px 1fr;gap:8px;align-items:center;' }, [ el('div', { style:'opacity:.8' }, [label]), node ]);
    body.appendChild(row('Backend', selBackend));
    body.appendChild(row('Date', el('div', {}, [inputDate, btnLoad])));
    body.appendChild(row('Game', selGame));
    body.appendChild(row('Mode', selMode));
    body.appendChild(row('Speed', selSpeed));
    body.appendChild(row('Start', selStart));
    body.appendChild(row('Inning / Half (optional)', el('div', {}, [selInning, selHalf])));
    body.appendChild(el('div', { style:'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
      el('button', { style:'padding:8px 12px;border-radius:8px;background:#6c757d;color:#fff;', onclick: close }, ['Cancel']),
      btnConnect
    ]));
    card.appendChild(body);
  }

  // Launcher button
  function ensureLauncher(){
    if (document.getElementById('wizard-launch')) return;
    const b = el('button', { id:'wizard-launch', style:'position:fixed;left:16px;top:12px;z-index:61;background:#143652;color:#bfe;border:1px solid #235; padding:8px 10px;border-radius:10px;font:12px/1 monospace;' }, ['⚙ Connect Wizard']);
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }

  window.addEventListener('DOMContentLoaded', ensureLauncher);
})();