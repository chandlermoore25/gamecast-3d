// orchestrator.mjs
import { schedule } from './timeline.mjs';
export class Orchestrator {
  constructor({ server, gamePk }){ this.server=server.replace(/\/$/, ''); this.gamePk=gamePk; this.ws=null; this.lastSeq=0; console.debug('[Orch] new', this.server, this.gamePk); }
  async connectLive(){ const url=`${this.server}/ws/game/${this.gamePk}`.replace('http','ws'); console.debug('[Orch] connectLive', url);
    const ws=new WebSocket(url); this.ws=ws; ws.onopen=()=>console.debug('[Orch] WS open'); ws.onclose=()=>console.debug('[Orch] WS close'); ws.onerror=(e)=>console.warn('[Orch] WS error', e); ws.onmessage=(ev)=>this._route(ev.data); }
  async playReplay(startMarker){ const params=new URLSearchParams({ gamePk:String(this.gamePk), mode:'rewind' }); if(startMarker) params.set('from', startMarker);
    const url=`${this.server}/sse/stream?${params.toString()}`; console.debug('[Orch] playReplay SSE', url);
    const res=await fetch(url); const reader=res.body.getReader(); const decoder=new TextDecoder(); let buffer='';
    while(true){ const { value, done } = await reader.read(); if(done) break; buffer+=decoder.decode(value, { stream:true }); let idx;
      while((idx = buffer.indexOf('\n\n')) >= 0){ const chunk = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx+2); if (!chunk) continue;
        for (const line of chunk.split('\n')){ const m=line.match(/^data:\s*(.*)$/); if(m) this._route(m[1]); } } } console.debug('[Orch] Replay finished'); }
  _route(raw){ try{ const msg=(typeof raw==='string')?JSON.parse(raw):raw; const now=performance.now(); const t0=now;
      switch (msg.event){ case 'pitch': schedule([{ at:t0, do:()=>emit('pitch-released', msg)}]); break;
        case 'swing': schedule([{ at:t0, do:()=>emit('swing-start', msg)}]); break;
        case 'contact': schedule([{ at:t0, do:()=>emit('contact', msg)}]); break;
        case 'outcome': case 'count': schedule([{ at:t0, do:()=>emit(msg.event, msg)}]); break; default: break; } }
    catch(e){ console.warn('[Orch] route error', e); } } }
function emit(type, data){ document.dispatchEvent(new CustomEvent('gc:play', { detail:{ type, data } })); }