/**
 * Frosted Glass Theme - Minimal Script
 * Only handles canvas transparency + cleanup
 * No heavy animations to avoid conflicts
 */
(function() {
  'use strict';
  
  const canvas = document.getElementById('themeCanvas');
  
  // If no canvas, just register empty cleanup
  if (!canvas) {
    window.ThemeCleanup = function cleanup() {};
    return;
  }

  const ctx = canvas.getContext('2d');
  let animationFrame = null;
  let resizeHandler = null;

  // Resize handler
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  resizeCanvas();
  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);

  // Optional: Very subtle particle effect (disabled by default for performance)
  // Set ENABLE_PARTICLES = true below to activate
  const ENABLE_PARTICLES = false;
  const particles = [];
  
  if (ENABLE_PARTICLES) {
    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
        this.radius = Math.random() * 1 + 0.5;
        this.alpha = Math.random() * 0.2 + 0.05;
      }
      update() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(126, 200, 227, ${this.alpha})`;
        ctx.fill();
      }
    }
    
    for (let i = 0; i < 20; i++) particles.push(new Particle());
  }

  // Animation loop - KEEP CANVAS TRANSPARENT
  function animate() {
    // CRITICAL: Clear with transparency only
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (ENABLE_PARTICLES) {
      particles.forEach(p => { p.update(); p.draw(); });
    }
    
    animationFrame = requestAnimationFrame(animate);
    // Track with ThemeManager if available
    if (typeof ThemeManager !== 'undefined' && ThemeManager.trackAnimation) {
      ThemeManager.trackAnimation(animationFrame);
    }
  }
  
  if (ENABLE_PARTICLES) animate();

  // ✅ REQUIRED: Global cleanup function
  window.ThemeCleanup = function cleanup() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    
    // Clear canvas
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.resetTransform();
    } catch(e) { console.warn('Cleanup error:', e); }
    
    // Help GC
    particles.length = 0;
    
    console.log('✓ Frosted Glass cleanup complete');
  };
  
  // Optional registry support
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('✓ Frosted Glass registry cleanup');
    });
  }
  
})();