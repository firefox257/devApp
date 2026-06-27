/* =========================================================
   Game Initialization
   ========================================================= */
console.log('🎮 Crystal Quest initialized');
console.warn('This is a sample warning');

// Spawn game entities
spawnCrystals(15);
for (let i = 0; i < 5; i++) spawnEnemy();

// Initialize HUD
updateHUD();

// Start game loop
animate();

console.log('🌲 Scene ready:', trees.length, 'trees,', crystals.length, 'crystals,', enemies.length, 'enemies');

// Hide instructions after 5 seconds
setTimeout(() => {
  document.getElementById('instructions').style.opacity = '0';
  setTimeout(() => document.getElementById('instructions').remove(), 500);
}, 5000);