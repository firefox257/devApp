/* =========================================================
   Game Entities
   ========================================================= */

// Crystals
const crystals = [];
function spawnCrystals(n) {
  for (let i = 0; i < n; i++) {
    const geo = new THREE.OctahedronGeometry(0.4, 0);
    const hue = Math.random();
    const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.8,
      roughness: 0.2, metalness: 0.6
    });
    const c = new THREE.Mesh(geo, mat);
    const r = 5 + Math.random() * 30;
    const a = Math.random() * Math.PI * 2;
    c.position.set(Math.cos(a)*r, 1.2, Math.sin(a)*r);
    c.castShadow = true;

    const light = new THREE.PointLight(color, 0.8, 6);
    c.add(light);

    scene.add(c);
    crystals.push({ mesh: c, collected: false });
  }
  document.getElementById('total-crystals').textContent = n;
}

// Player (wizard)
const player = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8),
  new THREE.MeshStandardMaterial({ color: 0x3a4fbf })
);
body.position.y = 0.6; body.castShadow = true;
player.add(body);
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0xffd9b3 })
);
head.position.y = 1.5; head.castShadow = true;
player.add(head);
const hat = new THREE.Mesh(
  new THREE.ConeGeometry(0.45, 0.8, 8),
  new THREE.MeshStandardMaterial({ color: 0x2a1a5a })
);
hat.position.y = 2.05; hat.castShadow = true;
player.add(hat);
scene.add(player);

// Enemies (shadow creatures)
const enemies = [];
function spawnEnemy() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a0a2a, emissive: 0x4a0a4a, emissiveIntensity: 0.5 })
  );
  core.castShadow = true;
  g.add(core);
  const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a5a });
  const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.15, 0.1, 0.45);
  const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(0.15, 0.1, 0.45);
  g.add(e1); g.add(e2);

  const r = 20 + Math.random() * 15;
  const a = Math.random() * Math.PI * 2;
  g.position.set(Math.cos(a)*r, 0.5, Math.sin(a)*r);
  scene.add(g);
  enemies.push({ mesh: g, hp: 2, speed: 0.02 + Math.random()*0.02 });
}

// Projectiles
const projectiles = [];
function castSpell() {
  const dir = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  const geo = new THREE.SphereGeometry(0.2, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd86b });
  const p = new THREE.Mesh(geo, mat);
  p.position.copy(player.position).add(new THREE.Vector3(0, 1, 0));
  const light = new THREE.PointLight(0xffd86b, 1, 5);
  p.add(light);
  scene.add(p);
  projectiles.push({ mesh: p, dir, life: 2.0 });
  console.log('✨ Spell cast');
}