/* =========================================================
   Main Game Loop
   ========================================================= */
const clock = new THREE.Clock();
let elapsed = 0;
const speed = 6;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (!state.gameOver) {
    // Movement relative to character's facing direction
    const angle = player.rotation.y;
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const right = new THREE.Vector3(-Math.cos(angle), 0, Math.sin(angle));

    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -joyVec.y);
    moveDir.addScaledVector(right, joyVec.x);

    const mag = moveDir.length();
    if (mag > 0.1) {
      moveDir.normalize();
      const actualSpeed = speed * Math.min(mag, 1);
      player.position.x += moveDir.x * actualSpeed * dt;
      player.position.z += moveDir.z * actualSpeed * dt;
    }

    // Jump physics
    if (!isGrounded) {
      yVelocity += GRAVITY * dt;
      player.position.y += yVelocity * dt;
      if (player.position.y <= 0) {
        player.position.y = 0;
        yVelocity = 0;
        isGrounded = true;
      }
    }

    player.position.x = Math.max(-45, Math.min(45, player.position.x));
    player.position.z = Math.max(-45, Math.min(45, player.position.z));

    // Camera follow: orbit with pitch controlling VIEW angle
    const yaw = player.rotation.y;
    
    // When pitch is positive (looking up), lower the camera slightly
    // When pitch is negative (looking down), raise the camera slightly
    const elev = CAM_BASE_ELEV - cameraPitch * 0.3;
    
    const camOffset = new THREE.Vector3(
      -CAM_RADIUS * Math.cos(elev) * Math.sin(yaw),
       CAM_RADIUS * Math.sin(elev),
      -CAM_RADIUS * Math.cos(elev) * Math.cos(yaw)
    );
    const targetCam = player.position.clone().add(camOffset);
    camera.position.lerp(targetCam, 0.1);
    
    // LookAt target: when pitch is positive (looking up), target is higher
    // When pitch is negative (looking down), target is lower
    const lookAtY = player.position.y + 1 + cameraPitch * 4;
    camera.lookAt(player.position.x, lookAtY, player.position.z);

    // Crystals animation + pickup
    for (const c of crystals) {
      if (c.collected) continue;
      c.mesh.rotation.y += dt * 2;
      c.mesh.rotation.x += dt * 1.2;
      c.mesh.position.y = 1.2 + Math.sin(elapsed*2 + c.mesh.position.x) * 0.2;
      const dx = c.mesh.position.x - player.position.x;
      const dz = c.mesh.position.z - player.position.z;
      const horizDist = Math.hypot(dx, dz);
      const vertDist = Math.abs(c.mesh.position.y - (player.position.y + 1));
      if (horizDist < 1.2 && vertDist < 1.5) {
        c.collected = true;
        scene.remove(c.mesh);
        state.crystalsCollected++;
        state.score += 10;
        console.log('💎 Crystal collected!', state.crystalsCollected);
        updateHUD();
      }
    }

    // Enemies
    for (const en of enemies) {
      if (en.hp <= 0) continue;
      const dir = new THREE.Vector3().subVectors(player.position, en.mesh.position);
      dir.y = 0;
      const d = dir.length();
      if (d > 0.01) {
        dir.normalize();
        en.mesh.position.add(dir.multiplyScalar(en.speed * 60 * dt));
        en.mesh.lookAt(player.position.x, en.mesh.position.y, player.position.z);
      }
      en.mesh.position.y = 0.5 + Math.sin(elapsed*3 + en.mesh.position.x) * 0.1;
      if (d < 1.0 && player.position.y < 1.2) {
        state.health -= 20 * dt;
        updateHUD();
        if (state.health <= 0) endGame(false);
      }
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.mesh.position.add(p.dir.clone().multiplyScalar(20 * dt));
      p.life -= dt;
      for (const en of enemies) {
        if (en.hp <= 0) continue;
        if (p.mesh.position.distanceTo(en.mesh.position) < 0.8) {
          en.hp--;
          p.life = 0;
          state.score += 5;
          console.log('💥 Hit! Enemy HP:', en.hp);
          if (en.hp <= 0) {
            scene.remove(en.mesh);
            state.score += 20;
            console.log('☠️ Enemy defeated!');
          }
          updateHUD();
          break;
        }
      }
      if (p.life <= 0) {
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }

    if (state.crystalsCollected >= crystals.length &&
        enemies.every(e => e.hp <= 0)) {
      endGame(true);
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (e.target.tagName !== 'DIV' || !e.target.closest('#console-list')) {
    e.preventDefault();
  }
}, { passive: false });