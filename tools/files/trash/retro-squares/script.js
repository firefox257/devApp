/* themes/retro-squares/script.js */
(function() {
  'use strict';
  
  // 1. Defensive canvas setup
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) {
    console.warn('Retro Squares: Canvas not found - running in static mode');
    window.ThemeCleanup = function cleanup() {};
    return;
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Retro Squares: Could not get canvas context');
    window.ThemeCleanup = function() {};
    return;
  }
  
  // 2. Resource tracking for cleanup
  const resources = {
    animationFrame: null,
    resizeHandler: null,
    intervals: [],
    timeouts: []
  };
  
  // 3. Enforce canvas layering (defensive)
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;background:transparent;';
  
  // 4. Theme settings from themes.json
  const themeId = 'retro-squares';
  const config = window.ThemeConfig?.[themeId]?.settings || {};
  const gridSpeed = config.gridSpeed ?? 0.5;
  const baseSquareSize = config.squareSize ?? 40;
  const pulseEnabled = config.pulseEnabled ?? true;
  const particleCount = config.particleCount ?? 15;
  
  // 5. HiDPI-aware resize
  let dpr = window.devicePixelRatio || 1;
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  resizeCanvas();
  
  resources.resizeHandler = resizeCanvas;
  window.addEventListener('resize', resources.resizeHandler);
  
  // 6. Respect reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    console.log('Retro Squares: Reduced motion - static grid only');
    drawStaticGrid();
    window.ThemeCleanup = function() {};
    return;
  }
  
  // 7. Grid animation state
  let offsetX = 0, offsetY = 0;
  let time = 0;
  
  // Particle system for floating neon squares
  const particles = [];
  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width / dpr;
      this.y = Math.random() * canvas.height / dpr;
      this.size = Math.random() * 8 + 4;
      this.speedX = (Math.random() - 0.5) * 0.8;
      this.speedY = (Math.random() - 0.5) * 0.8;
      this.color = ['#00ff88', '#ff00ff', '#00e5ff'][Math.floor(Math.random() * 3)];
      this.alpha = Math.random() * 0.5 + 0.3;
      this.pulse = Math.random() * Math.PI * 2;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.pulse += 0.05;
      
      // Wrap around edges
      if (this.x < -20) this.x = canvas.width / dpr + 20;
      if (this.x > canvas.width / dpr + 20) this.x = -20;
      if (this.y < -20) this.y = canvas.height / dpr + 20;
      if (this.y > canvas.height / dpr + 20) this.y = -20;
    }
    draw(ctx) {
      const pulseFactor = pulseEnabled ? (Math.sin(this.pulse) * 0.3 + 0.7) : 1;
      ctx.save();
      ctx.globalAlpha = this.alpha * pulseFactor;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = this.color;
      ctx.fillRect(this.x, this.y, this.size, this.size);
      ctx.restore();
    }
  }
  
  // Initialize particles
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }
  
  // 8. Drawing functions
  function drawStaticGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
    ctx.lineWidth = 1;
    
    const size = baseSquareSize;
    for (let x = 0; x < canvas.width / dpr; x += size) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height / dpr);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height / dpr; y += size) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width / dpr, y);
      ctx.stroke();
    }
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Animate grid offset for scrolling effect
    offsetX = (offsetX + gridSpeed * 0.5) % baseSquareSize;
    offsetY = (offsetY + gridSpeed * 0.3) % baseSquareSize;
    time += 0.01;
    
    // Draw animated grid
    ctx.strokeStyle = `rgba(0, 255, 136, ${0.1 + Math.sin(time) * 0.05})`;
    ctx.lineWidth = 1;
    
    const size = baseSquareSize;
    // Vertical lines
    for (let x = -offsetX; x < canvas.width / dpr + size; x += size) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height / dpr);
      ctx.stroke();
    }
    // Horizontal lines
    for (let y = -offsetY; y < canvas.height / dpr + size; y += size) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width / dpr, y);
      ctx.stroke();
    }
    
    // Draw pulsing accent lines every 5th grid line
    ctx.strokeStyle = `rgba(0, 255, 136, ${0.3 + Math.sin(time * 2) * 0.1})`;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ff88';
    
    for (let x = -offsetX; x < canvas.width / dpr + size; x += size * 5) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height / dpr);
      ctx.stroke();
    }
    for (let y = -offsetY; y < canvas.height / dpr + size; y += size * 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width / dpr, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    
    // Update and draw particles
    particles.forEach(p => {
      p.update();
      p.draw(ctx);
    });
    
    // Continue animation loop
    resources.animationFrame = requestAnimationFrame(animate);
    
    // Track with ThemeManager for auto-cleanup
    if (typeof ThemeManager !== 'undefined' && ThemeManager.trackAnimation) {
      ThemeManager.trackAnimation(resources.animationFrame);
    }
  }
  
  // Start animation
  animate();
  
  // 9. REQUIRED: Global cleanup function
  window.ThemeCleanup = function cleanup() {
    console.log('Retro Squares: Cleanup started');
    
    // Cancel animation frame
    if (resources.animationFrame) {
      cancelAnimationFrame(resources.animationFrame);
      resources.animationFrame = null;
    }
    
    // Remove event listeners
    if (resources.resizeHandler) {
      try {
        window.removeEventListener('resize', resources.resizeHandler);
      } catch(e) {
        console.warn('Cleanup: resize listener removal error', e);
      }
      resources.resizeHandler = null;
    }
    
    // Clear intervals/timeouts
    resources.intervals.forEach(id => {
      try { clearInterval(id); } catch(e) {}
    });
    resources.intervals = [];
    resources.timeouts.forEach(id => {
      try { clearTimeout(id); } catch(e) {}
    });
    resources.timeouts = [];
    
    // Clear and reset canvas
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch(e) {
      console.warn('Retro Squares: Canvas clear error', e);
    }
    
    // Free particle array for GC
    particles.length = 0;
    
    console.log('Retro Squares: Cleanup complete');
  };
  
  // 10. Optional: Register additional cleanup via ThemeManager
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('Retro Squares: Registry cleanup executed');
    });
  }
  
  console.log('✓ Retro Squares theme loaded');
})();