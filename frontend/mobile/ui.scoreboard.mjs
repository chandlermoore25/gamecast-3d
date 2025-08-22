// ui.scoreboard.mjs
console.debug('[UI][Scoreboard] init');
const hud=document.getElementById('hud'); const elMatch=document.getElementById('hudMatch'); const elInn=document.getElementById('hudInning'); const elCount=document.getElementById('hudCount'); const elMsg=document.getElementById('hudMsg');
hud.style.display='block'; elMatch.textContent='GameCast 3D'; elInn.textContent='Inning —'; elCount.textContent='B-S-O: —';
function refreshFromState(){ const gs=window.gc?.gameState; if(!gs) return; try{ const s=gs.getScoreboard?gs.getScoreboard():null; if(s){ elMatch.textContent=s.matchup||'—'; elInn.textContent=s.inningText||`Inning ${s.inning ?? '—'}`; elCount.textContent=`B-S-O: ${s.balls ?? '—'}-${s.strikes ?? '—'}-${s.outs ?? '—'}`; } }catch(e){} }
document.addEventListener('gc:play', (ev)=>{ const { type, data } = ev.detail || {}; if(type==='count'){ const b=data?.balls??data?.b; const s=data?.strikes??data?.s; const o=data?.outs??data?.o; elCount.textContent=`B-S-O: ${b ?? '—'}-${s ?? '—'}-${o ?? '—'}`; }
  if(type==='outcome' && data?.desc){ elMsg.textContent=data.desc; setTimeout(()=> elMsg.textContent='Ready', 3000); } refreshFromState(); });
let tries=0; (function poll(){ refreshFromState(); if(++tries<20) setTimeout(poll,250); })();