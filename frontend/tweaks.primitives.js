// tweaks.primitives.js
// Creates a procedural baseball (~73 mm) and a simple wood bat (~0.84 m)
// if gc.nodes.ball / gc.nodes.bat are not already present.
// Safe to include alongside your loaders.

(async () => {
  const waitFor = (check, ms = 10000) =>
    new Promise((res, rej) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        try {
          const ok = check();
          if (ok) { clearInterval(id); res(ok); }
          else if (performance.now() - t0 > ms) { clearInterval(id); rej(new Error('timeout')); }
        } catch (e) { clearInterval(id); rej(e); }
      }, 60);
    });

  await waitFor(() => window.gc && gc.scene && gc.THREE);

  const T = gc.THREE;
  const scene = gc.scene;

  // Try to use anchors for initial placement
  const getWorldPos = o => (o ? new T.Vector3().setFromMatrixPosition(o.matrixWorld) : null);
  const plate = gc.anchors?.plate || gc.anchors?.PlateCenter || null;
  const rubber = gc.anchors?.rubber || gc.anchors?.RubberCenter || null;

  // --- BALL (~73 mm diameter)
  if (!gc.nodes?.ball) {
    const R = 0.0366; // meters (MLB baseball radius ~36.6 mm)
    const geo = new T.SphereGeometry(R, 32, 24);
    const mat = new T.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.0
    });
    const ball = new T.Mesh(geo, mat);
    ball.name = 'ProceduralBaseball';
    ball.castShadow = true;
    ball.receiveShadow = true;

    // Start it at the rubber if possible, otherwise in front of plate
    let p = getWorldPos(rubber) || (getWorldPos(plate)?.clone().add(new T.Vector3(0, 1.1, -18))) || new T.Vector3(0, 1.1, 0);
    ball.position.copy(p);

    gc.nodes = gc.nodes || {};
    gc.nodes.ball = ball;
    scene.add(ball);
    console.log('[primitives] ball created');
  }

  // --- BAT (~0.84 m length) — simple 3-cylinder stack
  if (!gc.nodes?.bat) {
    const group = new T.Group();
    group.name = 'ProceduralBat';

    // Dimensions (meters)
    const L = 0.84;                      // total length ~33"
    const handleL = 0.27, taperL = 0.35, barrelL = 0.22;
    const rHandleTop = 0.012, rHandleBot = 0.017;
    const rBarrel = 0.033;
    const knobL = 0.02, rKnob = 0.02;

    const wood = new T.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.6, metalness: 0.0 });

    // Pieces are Y-up, centered; we offset them along Y to stack end-to-end.
    const mkCyl = (rt, rb, h) => new T.Mesh(new T.CylinderGeometry(rt, rb, h, 24, 1, false), wood);

    const handle = mkCyl(rHandleTop, rHandleBot, handleL);
    const taper  = mkCyl(rBarrel * 0.7, rHandleBot, taperL);
    const barrel = mkCyl(rBarrel, rBarrel, barrelL);
    const knob   = mkCyl(rKnob * 0.7, rKnob, knobL);

    // Position segments along Y so the "knob" is at Y=0 and barrel at Y=L
    let y = 0;
    knob.position.y   = y + knobL * 0.5;   y += knobL;
    handle.position.y = y + handleL * 0.5; y += handleL;
    taper.position.y  = y + taperL * 0.5;  y += taperL;
    barrel.position.y = y + barrelL * 0.5; y += barrelL;

    group.add(knob, handle, taper, barrel);

    // Put the bat near the plate to start
    const p = getWorldPos(plate) || new T.Vector3(0, 0, 0);
    group.position.copy(p.clone().add(new T.Vector3(0.95, 0.9, -0.25)));
    group.rotation.z = -Math.PI * 0.15;

    gc.nodes = gc.nodes || {};
    gc.nodes.bat = group;
    scene.add(group);
    console.log('[primitives] bat created');
  }
})();
