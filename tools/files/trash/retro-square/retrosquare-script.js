/**
 * Retro Square Theme - Canvas Animation
 * Features: Moving grid particles, terminal-style scan effects
 * ✅ Follows all cleanup requirements from Material Icons OS guide
 */
(function() {
  'use strict';
  
  // 1. Get canvas with defensive checks
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) {
    console.warn('⚠ Retro Square: Canvas not found - running in CSS-only mode');
    window.ThemeCleanup = function cleanup() {};
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('❌ Retro Square: Could not get canvas context');
    window.ThemeCleanup = function() {};
    return;
  }

  // 2. Load theme settings from config
  const config = window.ThemeConfig?.['retro-square']?.settings || {};
  const settings = {
    gridSpeed: config.gridSpeed ?? 0.5,
    particleCount: config.particleCount ?? 25,
    scanlineIntensity: config.scanlineIntensity ?? 0.15,
    glowEnabled: config.glowEnabled ?? true
  };

  // Apply scanline intensity to CSS variable
  document.documentElement.style.setProperty('--scanline-intensity', settings.scanlineIntensity);

  // 3. Track ALL resources for cleanup
  const themeResources = {
    animationFrame: null,
    resizeHandlers: [],
    particles: [],
    canvas: canvas,
    ctx: ctx,
    lastTime: 0
  };

  // 4. Helper: Register resize handler with tracking
  function addResizeHandler(handler) {
    window.addEventListener('resize', handler);
    themeResources.resizeHandlers.push(handler);
  }

  // 5. HiDPI-aware resize handling
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    // Reinitialize particles on resize
    initParticles();
  }
  resizeCanvas();
  addResizeHandler(resizeCanvas);

  // 6. Ensure canvas stays behind UI
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;background:transparent;';

  // 7. Respect reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    console.log('♿ Retro Square: Reduced motion preferred - skipping animation');
    window.ThemeCleanup = function() {};
    return;
  }

  // 8. Particle class for retro grid effect
  class RetroParticle {
    constructor() {
      this.reset();
    }
    
    reset() {
      // Start at random grid position
      this.x = Math.floor(Math.random() * (window.innerWidth / 24)) * 24;
      this.y = -24;
      this.speed = 0.3 + Math.random() * settings.gridSpeed;
      this.size = 2 + Math.random() * 3;
      this.opacity = 0.3 + Math.random() * 0.7;
      this.trail = [];
      this.maxTrail = 3 + Math.floor(Math.random() * 4);
    }
    
    update(deltaTime) {
      // Move down with slight horizontal drift
      this.y += this.speed * deltaTime;
      this.x += Math.sin(this.y * 0.02) * 0.3;
      
      // Add to trail
      this.trail.push({ x: this.x, y: this.y, opacity: this.opacity });
      if (this.trail.length > this.maxTrail) {
        this.trail.shift();
      }
      
      // Reset if off screen
      if (this.y > window.innerHeight + 24) {
        this.reset();
      }
    }
    
    draw(ctx) {
      // Draw trail (pixel-style)
      this.trail.forEach((point, index) => {
        const alpha = point.opacity * (index / this.maxTrail);
        ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
        ctx.fillRect(
          Math.floor(point.x), 
          Math.floor(point.y), 
          Math.floor(this.size), 
          Math.floor(this.size)
        );
      });
      
      // Draw head with glow if enabled
      if (settings.glowEnabled) {
        ctx.shadowColor = 'rgba(0, 255, 65, 0.8)';
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = 'rgba(0, 255, 65, 1)';
      ctx.fillRect(
        Math.floor(this.x), 
        Math.floor(this.y), 
        Math.floor(this.size), 
        Math.floor(this.size)
      );
      ctx.shadowBlur = 0;
    }
  }

  // 9. Initialize particles
  function initParticles() {
    themeResources.particles = [];
    for (let i = 0; i < settings.particleCount; i++) {
      const p = new RetroParticle();
      // Distribute vertically on init
      p.y = Math.random() * window.innerHeight;
      themeResources.particles.push(p);
    }
  }
  initParticles();

  // 10. Main animation loop
  function animate(timestamp) {
    if (!themeResources.lastTime) themeResources.lastTime = timestamp;
    const deltaTime = Math.min((timestamp - themeResources.lastTime) / 16.67, 3); // Cap delta
    themeResources.lastTime = timestamp;
    
    // CRITICAL: Clear with transparency (never fill with color!)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Optional: Draw subtle grid overlay
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 24;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Update and draw particles
    themeResources.particles.forEach(p => {
      p.update(deltaTime);
      p.draw(ctx);
    });
    
    // Track animation frame with ThemeManager
    themeResources.animationFrame = requestAnimationFrame(animate);
    if (typeof ThemeManager !== 'undefined' && ThemeManager.trackAnimation) {
      ThemeManager.trackAnimation(themeResources.animationFrame);
    }
  }
  
  // Start animation
  console.log('✓ Retro Square animation started');
  themeResources.animationFrame = requestAnimationFrame(animate);

  // 11. ✅ REQUIRED: Set global cleanup function
  window.ThemeCleanup = function cleanup() {
    console.log('🔴 Retro Square cleanup started');
    
    // Cancel animation frame
    if (themeResources.animationFrame) {
      cancelAnimationFrame(themeResources.animationFrame);
      themeResources.animationFrame = null;
    }
    
    // Remove all resize listeners
    themeResources.resizeHandlers.forEach(handler => {
      try { window.removeEventListener('resize', handler); } catch(e) {}
    });
    themeResources.resizeHandlers = [];
    
    // Clear particles array to free memory
    themeResources.particles.length = 0;
    
    // Clear canvas thoroughly
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (e) { console.warn('⚠ Canvas clear error:', e); }
    
    // Reset CSS variable
    document.documentElement.style.removeProperty('--scanline-intensity');
    
    console.log('✓ Retro Square cleanup complete');
  };
  
  // 12. Optional: Register via cleanup registry
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('✓ Retro Square registry cleanup');
    });
  }
  
  console.log('🟢 Retro Square theme script loaded successfully');
})();