// tweaks.primitives.js
// Creates a procedural baseball (~73 mm) and a simple wood bat (~0.84 m)
// ENHANCED: Better integration with gc.nodes and proper registration

(async () => {
  const waitFor = (check, ms = 15000) =>
    new Promise((res, rej) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        try {
          const ok = check();
          if (ok) { clearInterval(id); res(ok); }
          else if (performance.now() - t0 > ms) { clearInterval(id); rej(new Error('timeout')); }
        } catch (e) { clearInterval(id); rej(e); }
      }, 100);
    });

  console.log('[PRIMITIVES] Waiting for GameCast...');
  await waitFor(() => window.gc && window.gc.scene && window.gc.THREE && window.gc.anchors);
  console.log('[PRIMITIVES] GameCast ready, creating primitives...');

  const T = window.gc.THREE;
  const scene = window.gc.scene;

  // Ensure nodes exists
  if (!window.gc.nodes) window.gc.nodes = {};

  // Try to use anchors for initial placement
  const getWorldPos = o => (o ? new T.Vector3().setFromMatrixPosition(o.matrixWorld) : null);
  const plate = window.gc.anchors?.plate || window.gc.anchors?.PlateCenter || null;
  const rubber = window.gc.anchors?.rubber || window.gc.anchors?.RubberCenter || null;

  // --- BALL (~73 mm diameter)
  if (!window.gc.nodes.ball) {
    console.log('[PRIMITIVES] Creating baseball...');
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
    let startPos;
    if (rubber) {
      startPos = getWorldPos(rubber);
      startPos.y += 1.1; // Shoulder height
    } else if (plate) {
      startPos = getWorldPos(plate);
      startPos.add(new T.Vector3(0, 1.1, -18));
    } else {
      startPos = new T.Vector3(0, 1.1, -15);
    }
    
    ball.position.copy(startPos);
    
    // Initialize physics data
    ball.userData.v = null; // Velocity vector
    ball.userData.initialPos = startPos.clone();

    // Register in multiple places for compatibility
    window.gc.nodes.ball = ball;
    scene.add(ball);
    
    console.log('[PRIMITIVES] Ball created at:', ball.position.toArray().map(n => n.toFixed(2)));
  } else {
    console.log('[PRIMITIVES] Ball already exists');
  }

  // --- BAT (~0.84 m length) — simple 3-cylinder stack
  if (!window.gc.nodes.bat) {
    console.log('[PRIMITIVES] Creating baseball bat...');
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
    const mkCyl = (rt, rb, h) => {
      const mesh = new T.Mesh(new T.CylinderGeometry(rt, rb, h, 24, 1, false), wood);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

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

    // Position bat near the plate/batter
    let batPos;
    if (plate) {
      batPos = getWorldPos(plate);
      batPos.add(new T.Vector3(0.95, 0.9, -0.25));
    } else {
      batPos = new T.Vector3(0.95, 0.9, -0.25);
    }
    
    group.position.copy(batPos);
    group.rotation.z = -Math.PI * 0.15; // Slight angle
    
    // Initialize animation data
    group.userData.initialRotation = { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z };

    // Register in multiple places for compatibility
    window.gc.nodes.bat = group;
    scene.add(group);
    
    console.log('[PRIMITIVES] Bat created at:', group.position.toArray().map(n => n.toFixed(2)));
  } else {
    console.log('[PRIMITIVES] Bat already exists');
  }

  // Verify objects are accessible
  setTimeout(() => {
    const ball = window.gc.nodes.ball;
    const bat = window.gc.nodes.bat;
    
    console.log('[PRIMITIVES] Verification:', {
      ball: !!ball,
      bat: !!bat,
      ballInScene: ball ? scene.children.includes(ball) : false,
      batInScene: bat ? scene.children.includes(bat) : false
    });
    
    if (ball) {
      console.log('[PRIMITIVES] Ball final position:', ball.position.toArray().map(n => n.toFixed(2)));
    }
    if (bat) {
      console.log('[PRIMITIVES] Bat final position:', bat.position.toArray().map(n => n.toFixed(2)));
      console.log('[PRIMITIVES] Bat final rotation:', bat.rotation.toArray().slice(0,3).map(n => n.toFixed(3)));
    }
    
    // Dispatch event to notify primitives are ready
    document.dispatchEvent(new CustomEvent('gc:primitives-ready', {
      detail: { ball: !!ball, bat: !!bat }
    }));
    
  }, 500);

  console.log('[PRIMITIVES] Primitives creation complete');
})().catch(error => {
  console.error('[PRIMITIVES] Failed to create primitives:', error);
});