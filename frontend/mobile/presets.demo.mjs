// presets.demo.mjs
import { schedule } from './timeline.mjs';
export function runOneInning(){ const now=performance.now(); const t=(d)=> now + d;
  schedule([{ at:t(400), do:()=>fire('pitch-released',{ mph:95, type:'FF', desc:'demo pitch 1' }) },
            { at:t(1100), do:()=>fire('swing-start',{}) },
            { at:t(1320), do:()=>fire('contact',{ inPlay:true, ev:102, la:25, spray:10 }) },
            { at:t(3200), do:()=>fire('count',{ balls:0, strikes:0, outs:1 }) }]);
  schedule([{ at:t(4600), do:()=>fire('pitch-released',{ mph:87, type:'SL', desc:'demo pitch 2' }) },
            { at:t(5250), do:()=>fire('swing-start',{}) },
            { at:t(5480), do:()=>fire('contact',{ foul:true }) },
            { at:t(7400), do:()=>fire('pitch-released',{ mph:88, type:'CH' }) },
            { at:t(8400), do:()=>fire('swing-start',{}) },
            { at:t(8600), do:()=>fire('contact',{ miss:true }) },
            { at:t(10400), do:()=>fire('count',{ balls:0, strikes:3, outs:2 }) }]);
  schedule([{ at:t(12200), do:()=>fire('pitch-released',{ mph:96, type:'FF' }) },
            { at:t(12800), do:()=>fire('swing-start',{}) },
            { at:t(13050), do:()=>fire('contact',{ inPlay:true, ev:108, la:32, spray:-15 }) },
            { at:t(17000), do:()=>fire('outcome',{ desc:'Home run!' }) },
            { at:t(18000), do:()=>fire('count',{ balls:0, strikes:0, outs:3 }) }]); }
function fire(type, data){ document.dispatchEvent(new CustomEvent('gc:play', { detail:{ type, data } })); }