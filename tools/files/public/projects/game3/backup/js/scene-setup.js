/* =========================================================
   Three.js Scene Setup
   ========================================================= */
const container = document.getElementById('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1033);
scene.fog = new THREE.Fog(0x1a1033, 25, 70);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Lights
const ambient = new THREE.AmbientLight(0x6a5acd, 0.5);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0xaab8ff, 0.7);
moon.position.set(20, 40, 10);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
scene.add(moon);

// Ground
const groundGeo = new THREE.PlaneGeometry(200, 200, 40, 40);
const pos = groundGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), y = pos.getY(i);
  pos.setZ(i, Math.sin(x*0.2)*0.3 + Math.cos(y*0.15)*0.3);
}
groundGeo.computeVertexNormals();
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.95 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Trees
const trees = [];
function makeTree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.4, 2, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a2c17 })
  );
  trunk.position.y = 1; trunk.castShadow = true;
  g.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 3, 7),
    new THREE.MeshStandardMaterial({ color: 0x1e5a2a })
  );
  leaves.position.y = 3; leaves.castShadow = true;
  g.add(leaves);
  g.position.set(x, 0, z);
  return g;
}

for (let i = 0; i < 40; i++) {
  const r = 15 + Math.random() * 35;
  const a = Math.random() * Math.PI * 2;
  const t = makeTree(Math.cos(a)*r, Math.sin(a)*r);
  scene.add(t); trees.push(t);
}