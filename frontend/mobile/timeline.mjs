// timeline.mjs
const Q=[];
export function schedule(steps){ for(const s of steps){ if(!s||typeof s.do!=='function'||typeof s.at!=='number') continue; Q.push(s); } Q.sort((a,b)=>a.at-b.at);
  if(Q.length) console.debug('[Timeline] scheduled', steps.length, 'next in', (Q[0].at - performance.now()).toFixed(1), 'ms'); }
export function tick(now){ let ran=0; while(Q.length && Q[0].at <= now){ const step=Q.shift(); try{ step.do(); ran++; }catch(e){ console.warn('[Timeline] step error', e); } } if(ran) console.debug('[Timeline] ran', ran, 'steps'); }
export const Timeline={ schedule, tick };