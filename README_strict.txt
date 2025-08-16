GameCast v1 — LOCAL 3D (Anchors) — README (Strict ESM)
======================================================
GOAL
----
Lightweight, VS Code–friendly 3D at-bat from catcher POV with 9-cell strike-zone heatmap.
Always loads (no CDN), auto-centers/scales via field anchors, and exposes a debug handle.

FILES
-----
- index.local.strict.html  -> Strict ESM entry (NO legacy fallback)
- app.module.local.js      -> Main app (anchors + debug hotkeys + HUD + heatmap)
- Models/                  -> field.glb, baseball.glb, bat.glb, Player/body.glb
- node_modules/three/...   -> installed locally (npm install three)

INSTALL
-------
1) In project root:
   npm init -y
   npm install three

2) Verify:
   node_modules/three/build/three.module.js exists
   Models/field.glb and Models/Player/body.glb exist (case sensitive)

RUN
---
Open index.local.strict.html with VS Code Live Server (or serve folder: npx http-server -p 5500).
window.gc is available after load:
    gc.scene.add(new gc.THREE.AmbientLight(0xffffff,0.7))
Hotkeys: H helpers, G ambient, C camera presets, R recalibrate

ANCHORS
-------
Export empties from Blender named: PlateCenter and RubberCenter (apply transforms).
If anchors missing, fallback centers/scales from world bounds.

NEXT
----
- Wire live events to: document.dispatchEvent(new CustomEvent('gc:play',{detail:{type:'PITCH',desc:'FB 96 [x,y]'}}));
- Map your animation clip names to MAP (top of app.module.local.js).
- Tune camera constants (CATCHER_HEIGHT, CATCHER_BACKOFF).
