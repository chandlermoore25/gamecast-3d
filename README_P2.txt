GameCast v1 — LOCAL 3D (Strict ESM, baked P2)
=============================================

What's new in this build
------------------------
- Player auto-rehome near plate after calibration (R/L toggle via button).
- Animation tolerant mapping by substring (swing/hit/follow/idle).
- Ball physics with gravity + optional Magnus lift; release near rubber; aim at plate target.
- Simple 3D trail tracker for pitch flight.
- Live data adapter: gc.ingestStatcast({ mph, plate_x_ft, plate_z_ft, sz_bot_ft, sz_top_ft, spin_rpm }).
- window.gc exposes { THREE, scene, camera, renderer, world, anchors, nodes, mixers, clips, tracker, ingestStatcast }.

How to run
----------
1) npm install three
2) Serve `index.local.strict.html` with Live Server.
3) In Console, try:
   gc.ingestStatcast({ mph:97, plate_x_ft:0.0, plate_z_ft:2.6, sz_bot_ft:1.5, sz_top_ft:3.5, spin_rpm:2400 })

Notes
-----
- Player GLB path candidates: Models/Player/body.glb (preferred), Player/body.glb, body.glb (root).
- If your rig is left-handed by default, toggle "Batter" to R/L to flip the box placement.
