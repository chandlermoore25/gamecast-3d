// ballBatLogic.js — SAFE STUB for local dev
// Provides minimal API so pages don't 404 if the real module isn't present.
// Replace with your full logic when ready.
(function(){
  'use strict';
  const log = (...a)=>console.log('[BallBatLogic]', ...a);
  function ensureBall(){
    const ball = window.gc?.nodes?.ball;
    if (!ball) { log('No ball found'); return null; }
    return ball;
  }
  const api = {
    launchBall(ballPhysics){
      log('launchBall called', ballPhysics);
      try{
        const THREE = window.gc?.THREE;
        const ball = ensureBall(); if(!ball || !THREE) return;
        const v = new THREE.Vector3(0, 0.02, 0.25);
        if (ballPhysics?.velocity) {
          const k = Math.max(0.05, Math.min(0.5, ballPhysics.velocity / 100));
          v.set(0, 0.02*k, 0.25*k);
        }
        ball.userData.v = v;
        if (window.tracerClear) window.tracerClear();
        if (window.tracerPush) window.tracerPush(ball.position);
      }catch(err){ log('launchBall error', err); }
    },
    swingBat(type, data){
      log('swingBat called', type, data||{});
    },
    reset(){
      log('reset called');
      try{
        const ball = ensureBall();
        if (ball) { ball.userData.v = null; }
      }catch{}
    },
    getStatus(){
      return { batState: { isSwinging: false } };
    }
  };
  window.ballBatLogic = api;
  log('SAFE STUB loaded');
})();
