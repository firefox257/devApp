/* =========================================================
   Game State & Physics
   ========================================================= */
const state = {
  score: 0,
  health: 100,
  crystalsCollected: 0,
  gameOver: false,
};

function updateHUD() {
  document.getElementById('score').textContent = state.score;
  document.getElementById('crystals').textContent = state.crystalsCollected;
  document.getElementById('health-fill').style.width = Math.max(0, state.health) + '%';
}

function endGame(won) {
  state.gameOver = true;
  document.getElementById('overlay-title').textContent = won ? '🏆 Victory!' : '💀 Game Over';
  document.getElementById('overlay-text').textContent =
    `Score: ${state.score} • Crystals: ${state.crystalsCollected}`;
  document.getElementById('overlay').classList.add('show');
  console.log(won ? 'Victory!' : 'Game over', { score: state.score });
}

document.getElementById('restart-btn').addEventListener('click', () => {
  location.reload();
});

/* =========================================================
   Jump state & physics
   ========================================================= */
let yVelocity = 0;
let isGrounded = true;
const GRAVITY = -28;
const JUMP_VELOCITY = 11;

function tryJump() {
  if (!isGrounded || state.gameOver) return;
  yVelocity = JUMP_VELOCITY;
  isGrounded = false;
  console.log('🦘 Jump!');
}