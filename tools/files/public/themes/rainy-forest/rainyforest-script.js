/**
 * Rainy Forest Theme Script
 * Realistic rain drops falling on transparent canvas
 * Rain is white/silver with varying opacity for realism
 * ✅ Compatible with ThemeManager cleanup system
 */
(function() {
  'use strict';
  
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) {
    console.warn('Rainy Forest theme: #themeCanvas not found');
    window.ThemeCleanup = function cleanup() {};
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Rainy Forest theme: Could not get canvas context');
    window.ThemeCleanup = function cleanup() {};
    return;
  }

  // ✅ Track resources for cleanup
  const themeResources = {
    animationFrame: null,
    resizeHandlers: [],
    fogOverlay: null,
    intervals: [],
    timeouts: []
  };

  // ✅ Helper: Register resize handler for cleanup tracking
  function addResizeHandler(handler) {
    window.addEventListener('resize', handler);
    themeResources.resizeHandlers.push(handler);
  }

  // Resize handling
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  resizeCanvas();
  addResizeHandler(resizeCanvas);

  // ✅ FIXED: Ensure canvas stays transparent - never fill with color
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ✅ FIXED: Realistic rain configuration
  const rainConfig = {
    dropCount: 200,
    dropSpeed: 12,
    dropLength: 25,
    dropWidth: 1,
    wind: 0.3,
    splashChance: 0.4,
    dropColorBase: 200,
    dropColorVar: 55,
    dropOpacityMin: 0.3,
    dropOpacityMax: 0.7
  };

  // Raindrop class
  class Raindrop {
    constructor() {
      this.reset(true);
    }

    reset(randomY = false) {
      this.x = Math.random() * canvas.width;
      this.y = randomY ? Math.random() * canvas.height : -Math.random() * 100;
      this.speed = rainConfig.dropSpeed + Math.random() * 5;
      this.length = rainConfig.dropLength + Math.random() * 15;
      this.opacity = rainConfig.dropOpacityMin + Math.random() * (rainConfig.dropOpacityMax - rainConfig.dropOpacityMin);
      this.width = rainConfig.dropWidth + Math.random() * 0.5;
      this.colorValue = rainConfig.dropColorBase + Math.random() * rainConfig.dropColorVar;
    }

    update() {
      this.y += this.speed;
      this.x += rainConfig.wind + Math.sin(this.y * 0.01) * 0.2;

      if (this.y > canvas.height) {
        if (Math.random() < rainConfig.splashChance) {
          createSplash(this.x, canvas.height);
        }
        this.reset();
      }

      if (this.x > canvas.width + 10) {
        this.x = -10;
      } else if (this.x < -10) {
        this.x = canvas.width + 10;
      }
    }

    draw() {
      const gradient = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.length);
      gradient.addColorStop(0, `rgba(${this.colorValue}, ${this.colorValue}, ${this.colorValue + 20}, 0)`);
      gradient.addColorStop(0.2, `rgba(${this.colorValue}, ${this.colorValue}, ${this.colorValue + 20}, ${this.opacity * 0.5})`);
      gradient.addColorStop(1, `rgba(${this.colorValue}, ${this.colorValue}, ${this.colorValue + 20}, ${this.opacity})`);
      
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x, this.y + this.length);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = this.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // Splash particle class
  class SplashParticle {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 4;
      this.vy = -Math.random() * 3 - 1;
      this.life = 1;
      this.decay = Math.random() * 0.03 + 0.02;
      this.size = Math.random() * 2 + 1;
      this.colorValue = 200 + Math.random() * 55;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.15;
      this.life -= this.decay;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.colorValue}, ${this.colorValue}, ${this.colorValue + 20}, ${this.life * 0.6})`;
      ctx.fill();
    }
  }

  // Initialize raindrops
  let raindrops = [];
  let splashes = [];

  function initRaindrops() {
    raindrops = [];
    for (let i = 0; i < rainConfig.dropCount; i++) {
      const drop = new Raindrop();
      drop.y = Math.random() * canvas.height;
      raindrops.push(drop);
    }
  }
  initRaindrops();
  addResizeHandler(initRaindrops);

  // Create splash effect
  function createSplash(x, y) {
    const particleCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < particleCount; i++) {
      splashes.push(new SplashParticle(x, y));
    }
  }

  // ✅ Animation loop
  function animate() {
    // Clear canvas completely - keep it transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw raindrops
    for (const drop of raindrops) {
      drop.update();
      drop.draw();
    }

    // Update and draw splashes
    for (let i = splashes.length - 1; i >= 0; i--) {
      splashes[i].update();
      splashes[i].draw();
      if (splashes[i].life <= 0) {
        splashes.splice(i, 1);
      }
    }

    // ✅ Request next frame AND track it with ThemeManager
    themeResources.animationFrame = requestAnimationFrame(animate);
    if (typeof ThemeManager !== 'undefined' && ThemeManager.trackAnimation) {
      ThemeManager.trackAnimation(themeResources.animationFrame);
    }
  }

  // Start animation
  console.log('✓ Rainy Forest rain animation started (realistic white/silver rain)');
  animate();

  // Optional: Add subtle fog layer via CSS (behind canvas)
  const fogOverlay = document.createElement('div');
  fogOverlay.className = 'fog-overlay';
  fogOverlay.style.cssText = 'pointer-events:none;z-index:0;position:fixed;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at bottom, rgba(100,120,100,0.1) 0%, transparent 70%);';
  document.body.appendChild(fogOverlay);
  themeResources.fogOverlay = fogOverlay;

  // ✅ EXPOSE CLEANUP VIA window.ThemeCleanup (REQUIRED)
  window.ThemeCleanup = function cleanup() {
    console.log('✓ Rainy Forest theme cleanup started');
    
    // Cancel animation frame
    if (themeResources.animationFrame) {
      cancelAnimationFrame(themeResources.animationFrame);
      themeResources.animationFrame = null;
    }
    
    // Remove all resize listeners we added
    themeResources.resizeHandlers.forEach(handler => {
      try {
        window.removeEventListener('resize', handler);
      } catch (e) {
        console.warn('⚠ Error removing resize handler:', e);
      }
    });
    themeResources.resizeHandlers = [];
    
    // Clear any tracked intervals/timeouts
    themeResources.intervals.forEach(id => {
      try { clearInterval(id); } catch(e) {}
    });
    themeResources.intervals = [];
    
    themeResources.timeouts.forEach(id => {
      try { clearTimeout(id); } catch(e) {}
    });
    themeResources.timeouts = [];
    
    // Clear canvas thoroughly
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.resetTransform();
    } catch (e) {
      console.warn('⚠ Error clearing canvas:', e);
    }
    
    // Remove fog overlay
    if (themeResources.fogOverlay && themeResources.fogOverlay.parentNode) {
      try {
        themeResources.fogOverlay.parentNode.removeChild(themeResources.fogOverlay);
      } catch (e) {
        console.warn('⚠ Error removing fog overlay:', e);
      }
      themeResources.fogOverlay = null;
    }
    
    // Free memory by clearing arrays
    raindrops = [];
    splashes = [];
    
    console.log('✓ Rainy Forest rain animation stopped');
  };
  
  // ✅ Optional: Also register via cleanup registry for multiple cleanup functions
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('✓ Rainy Forest theme registry cleanup');
      // Additional cleanup logic here if needed
    });
  }
  
})();