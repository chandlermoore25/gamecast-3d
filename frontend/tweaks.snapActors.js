// tweaks.snapActors.js (PATCHED VERSION)
// FIXED: Automatic Y-fix for floating players

import * as THREE from 'three';

// ---------- helpers --------------------------------------------------------
function toV3(a, scene) {
  if (!a) return null;
  if (a.isVector3) return a.clone();
  if (typeof a.x === 'number' && typeof a.y === 'number' && typeof a.z === 'number')
    return new THREE.Vector3(a.x, a.y, a.z);
  if (Array.isArray(a) && a.length >= 3)
    return new THREE.Vector3(+a[0], +a[1], +a[2]);
  if (a.isObject3D || (a.position && a.updateMatrixWorld)) {
    const v = new THREE.Vector3();
    a.updateMatrixWorld(true); a.getWorldPosition(v); return v;
  }
  if (typeof a === 'string' && scene?.getObjectByName) {
    const o = scene.getObjectByName(a);
    if (o) { const v = new THREE.Vector3(); o.updateMatrixWorld(true); o.getWorldPosition(v); return v; }
  }
  return null;
}

function getCharMesh(rig, prefer) {
  if (prefer) return prefer;
  let hit = null;
  rig.traverse(o => { if (!hit && (o.isSkinnedMesh || o.isMesh)) hit = o; });
  return hit || rig;
}

function getFootBonesWorld(mesh) {
  const bones = [];
  try {
    mesh.traverse(o => {
      if (!o || !o.isBone) return;
      const n = (o.name || '').toLowerCase();
      if (n.includes('foot') || n.includes('toe') || n.includes('ankle') || n.includes('ball')) {
        const w = new THREE.Vector3();
        o.updateMatrixWorld(true); o.getWorldPosition(w);
        bones.push({ name: n, w });
      }
    });
  } catch {}
  return bones;
}

function getFeetWorldAvg(mesh) {
  const bones = getFootBonesWorld(mesh);
  if (bones.length) {
    const sum = new THREE.Vector3();
    bones.forEach(b => sum.add(b.w));
    return sum.multiplyScalar(1 / bones.length);
  }
  const box = new THREE.Box3().setFromObject(mesh); // WORLD
  return new THREE.Vector3((box.min.x + box.max.x) * 0.5, box.min.y, (box.min.z + box.max.z) * 0.5);
}

function getBackFootWorld(mesh, fwd) {
  const bones = getFootBonesWorld(mesh);
  if (!bones.length) return getFeetWorldAvg(mesh);
  let best = bones[0], bestDot = bones[0].w.dot(fwd);
  for (let i = 1; i < bones.length; i++) {
    const d = bones[i].w.dot(fwd);
    if (d < bestDot) { bestDot = d; best = bones[i]; }
  }
  return best.w.clone();
}

function computeFacing(plateV, rubberV) {
  const fwd = plateV.clone().sub(rubberV).normalize(); // toward catcher
  const yaw = Math.atan2(fwd.x, fwd.z);
  return { yaw, fwd };
}

// place using a world measurement fn, then return the world bbox min.y
function placeByMeasuredPoint(rig, mesh, measureWorldFn, anchor, yaw, scaleMul = 1, debugTag = '', skipGroundFit = false) {
  rig.rotation.set(0, yaw, 0);
  if (scaleMul !== 1) rig.scale.multiplyScalar(scaleMul);
  rig.updateMatrixWorld(true);

  const pointW = measureWorldFn(mesh);
  const delta = pointW.clone().sub(rig.position);
  rig.position.copy(anchor.clone().sub(delta));
  rig.updateMatrixWorld(true);

  if (debugTag) {
    const after = measureWorldFn(mesh);
    const err = after.clone().sub(anchor);
    console.log(`[SNAP] ${debugTag} | Δ after snap`, err.toArray().map(n => +n.toFixed(3)));
  }

  if (skipGroundFit) {
    console.log(`[SNAP] ${debugTag} | Skipping ground fit (Y already adjusted)`);
    return rig.position.y;
  }

  const box = new THREE.Box3().setFromObject(rig);
  return isFinite(box.min.y) ? box.min.y : rig.position.y;
}

// ---------- main -----------------------------------------------------------
export function snapActors({
  scene,
  anchors = {},
  pitcher,
  batter,
  handed = 'R',
  pitcherMesh = null,
  batterMesh = null,
  debug = true,
  skipGroundFit = false // NEW: Skip the additional ground fitting
}) {
  const plateV  = toV3(anchors.plate, scene);
  const rubberV = toV3(anchors.rubber, scene);
  if (!plateV || !rubberV) { console.warn('[SNAP] bad anchors', anchors); return; }

  const { yaw, fwd } = computeFacing(plateV, rubberV);

  // size knobs
  const settings = (typeof window !== 'undefined' && window.gc && window.gc.settings) ? window.gc.settings : {};
  const DEFAULT_RATIO = 0.60;
  const playerScale  = (typeof settings.playerScale  === 'number') ? settings.playerScale  : DEFAULT_RATIO;
  const pitcherScale = (typeof settings.pitcherScale === 'number') ? settings.pitcherScale : playerScale;
  const batterScale  = (typeof settings.batterScale  === 'number') ? settings.batterScale  : playerScale;

  // position trim knobs
  const batterDepthMeters = (typeof settings.batterDepthMeters  === 'number') ? settings.batterDepthMeters  : 0.10; // toward catcher
  const batterYOffset     = (typeof settings.batterYOffsetMeters === 'number') ? settings.batterYOffsetMeters : 0.00; // up(+)/down(-)

  // anchors
  const pFeet = toV3(anchors.pitcher_feet || anchors.rubber, scene) || rubberV.clone();
  const bFeetAnchor = handed === 'R'
    ? (anchors.batterR_feet || anchors.batter_feet)
    : (anchors.batterL_feet || anchors.batter_feet);
  let bFeet = toV3(bFeetAnchor, scene);

  if (!bFeet) { // fallback if missing in GLB
    const up = new THREE.Vector3(0,1,0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const back = 2.0, lateral = 1.5;
    bFeet = plateV.clone()
      .sub(fwd.clone().multiplyScalar(back))
      .add(right.clone().multiplyScalar(handed === 'R' ? -lateral : lateral));
  }

  const bFeetBiased = bFeet.clone().add(fwd.clone().multiplyScalar(batterDepthMeters));

  // Pitcher 
  if (pitcher) {
    const mesh = getCharMesh(pitcher, pitcherMesh);
    placeByMeasuredPoint(pitcher, mesh, getFeetWorldAvg, pFeet, yaw, pitcherScale, 'pitcher', skipGroundFit);
    
    // FORCE ground the pitcher if floating
    if (!skipGroundFit) {
      const bbox = new THREE.Box3().setFromObject(pitcher);
      if (isFinite(bbox.min.y) && bbox.min.y > 0.1) {
        const adjustment = -bbox.min.y;
        pitcher.position.y += adjustment;
        pitcher.updateMatrixWorld(true);
        console.log('[SNAP] pitcher | FORCED ground adjustment:', adjustment.toFixed(3));
      }
    }
    
    if (debug) console.log('[SPAWN] pitcher pos', pitcher.position.toArray().map(n => n.toFixed(2)), 'scale', pitcher.scale.toArray());
  }

  // Batter — FORCE GROUND FIX
  if (batter) {
    const mesh = getCharMesh(batter, batterMesh);
    const minYBefore = placeByMeasuredPoint(batter, mesh, (m)=>getBackFootWorld(m, fwd), bFeetBiased, yaw + Math.PI, batterScale, 'batter(back-foot)', skipGroundFit);

    // ALWAYS try to ground the batter properly
    const box = new THREE.Box3().setFromObject(batter);
    if (isFinite(box.min.y)) {
      if (!skipGroundFit) {
        // Original logic
        const dy = bFeetBiased.y - box.min.y;
        batter.position.y += dy + batterYOffset;
        batter.updateMatrixWorld(true);
        if (debug) console.log('[SNAP] batter | groundY fit dy=', +dy.toFixed(3), 'yTrim=', batterYOffset);
      } else {
        // Force ground if still floating even with skipGroundFit
        if (box.min.y > 0.1) {
          const forceAdjustment = -box.min.y + batterYOffset;
          batter.position.y += forceAdjustment;
          batter.updateMatrixWorld(true);
          console.log('[SNAP] batter | FORCED ground adjustment:', forceAdjustment.toFixed(3));
        } else if (batterYOffset !== 0) {
          batter.position.y += batterYOffset;
          batter.updateMatrixWorld(true);
          if (debug) console.log('[SNAP] batter | applied yTrim only=', batterYOffset);
        }
      }
    }

    if (debug) console.log('[SPAWN] batter pos', batter.position.toArray().map(n => n.toFixed(2)), 'scale', batter.scale.toArray(), 'handed', handed);
  }

  if (debug) console.log('[snaps] snapped.');
}

export default snapActors;