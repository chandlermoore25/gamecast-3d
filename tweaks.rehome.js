// tweaks.rehome.js — small post-init fixes (rehoming + ball scale + tracer brightness)
(async () => {
  const waitFor = (check, ms = 6000) =>
    new Promise((resolve, reject) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        if (check()) { clearInterval(id); resolve(check()); }
        else if (performance.now() - t0 > ms) { clearInterval(id); reject(new Error('timeout')); }
      }, 50);
    });

  try {
    // wait for gc to exist and models to begin populating
    await waitFor(() => window.gc && gc.THREE && gc.scene && gc.nodes);

    const T = gc.THREE;

    // ---- Ball: scale to ~73mm diameter (0.073 m) ----
    if (gc.nodes.ball) {
      const box = new T.Box3().setFromObject(gc.nodes.ball);
      const s = box.getSize(new T.Vector3());
      const maxDim = Math.max(s.x || 0, s.y || 0, s.z || 0) || 1;
      const TARGET = 0.073; // meters (baseball diameter)
      gc.nodes.ball.scale.multiplyScalar(TARGET / maxDim);
      // optional: ensure it renders brightly against dark BG
      gc.nodes.ball.traverse(o => { if (o.material?.emissive) o.material.emissive.set('#444'); });
    }

    // ---- Player: rehome at RubberCenter and face plate ----
    if (gc.nodes.player && gc.anchors?.rubber && gc.anchors?.plate) {
      const p = gc.nodes.player;
      // normalize height to ~1.85m so the scale is consistent
      const bbox = new T.Box3().setFromObject(p);
      const size = bbox.getSize(new T.Vector3());
      const h = size.y || 1;
      p.scale.multiplyScalar(1.85 / h);

      const rubber = new T.Vector3().setFromMatrixPosition(gc.anchors.rubber.matrixWorld);
      const plate  = new T.Vector3().setFromMatrixPosition(gc.anchors.plate.matrixWorld);

      p.position.copy(rubber);
      p.lookAt(plate.x, plate.y + 1.7, plate.z);
    }

    // ---- Tracer: brighten so it pops ----
    if (gc.tracker?.line?.material) {
      const m = gc.tracker.line.material;
      m.color?.set?.('#ffd400'); // bright yellow
      m.transparent = true;
      m.opacity = 1.0;
      if (m.needsUpdate !== undefined) m.needsUpdate = true;
    }

    console.log('[tweaks] rehome + ball scale + tracer brightness applied');
  } catch (e) {
    console.warn('[tweaks] setup failed:', e);
  }
})();
