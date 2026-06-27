/* =========================================================
   Input: Virtual joystick
   ========================================================= */
const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');
let joyVec = { x: 0, y: 0 };
let joyActive = false, joyId = null;

function joyStart(e) {
  const t = e.changedTouches ? e.changedTouches[0] : e;
  joyId = e.changedTouches ? t.identifier : 'mouse';
  joyActive = true;
  joyMove(e);
}
function joyMove(e) {
  if (!joyActive) return;
  let t;
  if (e.changedTouches) {
    for (const tt of e.changedTouches) if (tt.identifier === joyId) { t = tt; break; }
    if (!t) return;
  } else t = e;
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  let dx = t.clientX - cx, dy = t.clientY - cy;
  const max = rect.width/2 - 27.5;
  const dist = Math.hypot(dx, dy);
  if (dist > max) { dx = dx/dist*max; dy = dy/dist*max; }
  stick.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / max; joyVec.y = dy / max;
  if (e.cancelable) e.preventDefault();
}
function joyEnd(e) {
  if (e.changedTouches) {
    let found = false;
    for (const tt of e.changedTouches) if (tt.identifier === joyId) { found = true; break; }
    if (!found) return;
  }
  joyActive = false; joyId = null;
  stick.style.transform = 'translate(0,0)';
  joyVec.x = 0; joyVec.y = 0;
}
joystick.addEventListener('touchstart', joyStart, { passive: false });
joystick.addEventListener('touchmove', joyMove, { passive: false });
joystick.addEventListener('touchend', joyEnd);
joystick.addEventListener('touchcancel', joyEnd);
joystick.addEventListener('mousedown', joyStart);
window.addEventListener('mousemove', joyMove);
window.addEventListener('mouseup', joyEnd);

/* =========================================================
   Input: Screen drag to rotate (yaw + pitch) + double-tap to jump
   ========================================================= */
let rotateTouchId = null;
let lastRotateX = 0;
let lastRotateY = 0;
const rotateSensitivity = 0.008;

// Camera pitch state (vertical look) - now controls the VIEW angle
let cameraPitch = 0;
const PITCH_MIN = -0.8;  // look down at ground
const PITCH_MAX = 0.8;   // look up at sky
const CAM_BASE_ELEV = Math.atan2(4, 6);     // ~34°, matches original height/distance
const CAM_RADIUS = Math.sqrt(6*6 + 4*4);    // ~7.21

// Double-tap tracking
let lastTapTime = 0;
let lastTapPos = { x: 0, y: 0 };
const DOUBLE_TAP_DELAY = 320;
const DOUBLE_TAP_DISTANCE = 40;

function isDoubleTap(clientX, clientY) {
  const now = performance.now();
  const dx = clientX - lastTapPos.x;
  const dy = clientY - lastTapPos.y;
  const dist = Math.hypot(dx, dy);
  if (now - lastTapTime < DOUBLE_TAP_DELAY && dist < DOUBLE_TAP_DISTANCE) {
    lastTapTime = 0;
    return true;
  }
  lastTapTime = now;
  lastTapPos = { x: clientX, y: clientY };
  return false;
}

renderer.domElement.addEventListener('touchstart', (e) => {
  if (rotateTouchId !== null) return;
  const t = e.changedTouches[0];

  if (isDoubleTap(t.clientX, t.clientY)) {
    tryJump();
    return;
  }

  rotateTouchId = t.identifier;
  lastRotateX = t.clientX;
  lastRotateY = t.clientY;
}, { passive: true });

renderer.domElement.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === rotateTouchId) {
      const dx = t.clientX - lastRotateX;
      const dy = t.clientY - lastRotateY;

      // Horizontal drag → yaw (character facing)
      player.rotation.y -= dx * rotateSensitivity;

      // Vertical drag → pitch (camera view angle). 
      // Finger moving up (dy negative) should look up (pitch positive).
      cameraPitch -= dy * rotateSensitivity;
      cameraPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch));

      lastRotateX = t.clientX;
      lastRotateY = t.clientY;
      break;
    }
  }
}, { passive: true });

renderer.domElement.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === rotateTouchId) {
      rotateTouchId = null;
      break;
    }
  }
}, { passive: true });

renderer.domElement.addEventListener('touchcancel', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === rotateTouchId) {
      rotateTouchId = null;
      break;
    }
  }
}, { passive: true });

// Mouse support
let mouseRotating = false;
let lastMouseX = 0;
let lastMouseY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (isDoubleTap(e.clientX, e.clientY)) {
    tryJump();
    return;
  }
  mouseRotating = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  if (!mouseRotating) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  player.rotation.y -= dx * rotateSensitivity;
  cameraPitch -= dy * rotateSensitivity;
  cameraPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch));

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});
window.addEventListener('mouseup', () => {
  mouseRotating = false;
});

// Action button
const actionBtn = document.getElementById('action-btn');
let lastCast = 0;
function doAction(e) {
  if (e) e.preventDefault();
  const now = performance.now();
  if (now - lastCast < 400) return;
  lastCast = now;
  castSpell();
}
actionBtn.addEventListener('touchstart', doAction, { passive: false });
actionBtn.addEventListener('mousedown', doAction);