// app.legacy.js — Non-module fallback using global THREE + GLTFLoader
(function(){
  function fatal(msg){
    const el=document.createElement('div');
    Object.assign(el.style,{position:'fixed',inset:'0',display:'grid',placeItems:'center',background:'#000',color:'#fff',font:'16px/1.4 ui-monospace'});
    el.textContent=msg; document.body.appendChild(el);
  }
  if(!window.THREE || !window.THREE.GLTFLoader){ return fatal('Legacy: THREE/GLTFLoader not loaded.'); }

  const THREE = window.THREE;
  const loader = new THREE.GLTFLoader();
  const PATHS = {
    field: ['Models/field.glb', './Models/field.glb', 'field.glb', './field.glb'],
    player:['Models/Player/body.glb','./Models/Player/body.glb','body.glb','./body.glb'],
    bat:   ['Models/bat.glb','./Models/bat.glb','bat.glb','./bat.glb'],
    ball:  ['Models/baseball.glb','./Models/baseball.glb','baseball.glb','./baseball.glb'],
  };

  let scene=new THREE.Scene(); scene.background=new THREE.Color(0x000000);
  let camera=new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 5000);
  camera.position.set(0,1.05,0.85); camera.lookAt(0,1.2,-18);
  let renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth,innerHeight); document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff,0x1a1a1a,0.95));
  const sun=new THREE.DirectionalLight(0xffffff,0.8); sun.position.set(8,12,6); scene.add(sun);

  let world=new THREE.Group(); scene.add(world);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(7,64), new THREE.MeshStandardMaterial({color:0x5a4026,roughness:1})); ground.rotation.x=-Math.PI/2; world.add(ground);
  const plateGeom=new THREE.Shape(); plateGeom.moveTo(-0.22,0); plateGeom.lineTo(0.22,0); plateGeom.lineTo(0.22,0.22); plateGeom.lineTo(0,0.44); plateGeom.lineTo(-0.22,0.22); plateGeom.closePath();
  const plate=new THREE.Mesh(new THREE.ShapeGeometry(plateGeom), new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9})); plate.rotation.x=-Math.PI/2; plate.position.set(0,0.01,0); world.add(plate);

  function loadAny(list,cb){
    return new Promise((resolve)=>{
      const next=(i)=>{
        if(i>=list.length) return resolve();
        loader.load(list[i], g=>{ cb(g); resolve(); }, undefined, ()=>{ next(i+1); });
      };
      next(0);
    });
  }

  Promise.all([
    loadAny(PATHS.field, g=>world.add(g.scene)),
    loadAny(PATHS.player, g=>{ g.scene.scale.set(1.25,1.25,1.25); world.add(g.scene);}),
    loadAny(PATHS.bat, g=>{ g.scene.position.set(0.25,1.05,-0.35); g.scene.rotation.set(0,Math.PI*0.1,Math.PI*0.1); world.add(g.scene);}),
    loadAny(PATHS.ball, g=>{ g.scene.position.set(0,1.0,-1.6); world.add(g.scene);}),
  ]).then(()=>{
    const clock=new THREE.Clock();
    renderer.setAnimationLoop(()=>{
      const dt=clock.getDelta();
      renderer.render(scene,camera);
    });
    window.__GC_OK = true; // mark success
  });
})();