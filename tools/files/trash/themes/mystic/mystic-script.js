/**
 * MYSTIC REALM - Canvas Animation System
 * Material Icons OS Theme Script v2.7+
 * Features: Floating particles, magical sparkles, rune effects
 * Color Palette: Warm amber, teal, purple (tavern-inspired)
 * 
 * ✅ UPDATED: DOM sparkle z-index layering (v2.7+)
 * ✅ MOBILE-FIRST: No hover states, touch-optimized
 */
(function() {
  'use strict';
  
  // ===== CONFIGURATION =====
  const themeId = 'mystic-realm';
  const config = window.ThemeConfig?.[themeId]?.settings || {};
  
  const PARTICLE_COUNT = config.particleCount ?? 50;
  const PARTICLE_SPEED = config.particleSpeed ?? 0.3;
  const GLOW_INTENSITY = config.glowIntensity ?? 0.6;
  const ENABLE_RUNES = config.enableRunes ?? true;
  const RUNE_FREQUENCY = config.runeFrequency ?? 3000;
  
  // ===== CANVAS SETUP =====
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) { 
    window.ThemeCleanup = function() {}; 
    return; 
  }
  
  const ctx = canvas.getContext('2d');
  let animationFrame = null;
  let resizeHandler = null;
  let runeInterval = null;
  let particles = [];
  let runes = [];
  
  // ===== HI-DPI SUPPORT =====
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  resizeCanvas();
  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);
  
  // ===== CANVAS LAYERING (v2.7+ COMPLIANT) =====
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:transparent;';
  
  // ===== RESPECT REDUCED MOTION =====
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.ThemeCleanup = function() {};
    return;
  }
  
  // ===== PARTICLE CLASS (Tavern-inspired colors) =====
  class MysticParticle {
    constructor() {
      this.reset();
    }
    
    reset() {
      this.x = Math.random() * canvas.width / (window.devicePixelRatio || 1);
      this.y = canvas.height / (window.devicePixelRatio || 1) + Math.random() * 100;
      this.size = Math.random() * 3 + 1;
      this.speedY = -Math.random() * PARTICLE_SPEED - 0.1;
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.opacity = Math.random() * 0.5 + 0.3;
      // Tavern color palette: amber, teal, purple, gold
      const hues = [30, 170, 280, 45]; // amber, teal, purple, gold
      this.hue = hues[Math.floor(Math.random() * hues.length)];
      this.glow = Math.random() * 15 + 10;
      this.twinkle = Math.random() * Math.PI * 2;
      this.twinkleSpeed = Math.random() * 0.02 + 0.01;
    }
    
    update(time) {
      this.y += this.speedY;
      this.x += this.speedX + Math.sin(time * 0.001 + this.twinkle) * 0.2;
      this.opacity = 0.3 + Math.sin(time * 0.002 + this.twinkle) * 0.2;
      
      // Reset if off screen
      if (this.y < -10) {
        this.reset();
        this.y = canvas.height / (window.devicePixelRatio || 1) + 10;
      }
    }
    
    draw(ctx, time) {
      const currentOpacity = this.opacity + Math.sin(time * 0.003 + this.twinkle) * 0.15;
      
      // Outer glow (lantern-like)
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.glow
      );
      gradient.addColorStop(0, `hsla(${this.hue}, 80%, 70%, ${currentOpacity * 0.8})`);
      gradient.addColorStop(0.4, `hsla(${this.hue}, 70%, 60%, ${currentOpacity * 0.4})`);
      gradient.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.glow, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Core particle
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${this.hue}, 90%, 80%, ${currentOpacity})`;
      ctx.fill();
      
      // Sparkle highlight
      ctx.beginPath();
      ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(60, 100%, 90%, ${currentOpacity * 0.9})`;
      ctx.fill();
    }
  }
  
  // ===== RUNE CLASS (Magical symbols - tavern ambiance) =====
  class MysticRune {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.size = Math.random() * 20 + 15;
      this.opacity = 1;
      this.scale = 0;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() - 0.5) * 0.03;
      // Tavern colors: amber, teal, purple, gold
      const hues = [30, 170, 280, 45];
      this.hue = hues[Math.floor(Math.random() * hues.length)];
      this.life = 1500;
      this.birth = Date.now();
      this.runeChar = ['✦', '✧', '◈', '❋', '❂', '✺', '✹', '✸'][Math.floor(Math.random() * 8)];
    }
    
    update() {
      const elapsed = Date.now() - this.birth;
      const progress = elapsed / this.life;
      
      if (progress >= 1) return false;
      
      // Ease in/out
      if (progress < 0.3) {
        this.scale = progress / 0.3;
        this.opacity = progress / 0.3;
      } else if (progress > 0.7) {
        this.scale = 1 - (progress - 0.7) / 0.3;
        this.opacity = 1 - (progress - 0.7) / 0.3;
      } else {
        this.scale = 1;
        this.opacity = 0.8 + Math.sin(progress * Math.PI) * 0.2;
      }
      
      this.rotation += this.rotationSpeed;
      this.y -= 0.3;
      
      return true;
    }
    
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.scale(this.scale, this.scale);
      
      // Glow effect (lantern-like)
      ctx.shadowColor = `hsla(${this.hue}, 90%, 70%, ${this.opacity * 0.8})`;
      ctx.shadowBlur = 20 * this.opacity;
      
      // Rune text
      ctx.font = `bold ${this.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `hsla(${this.hue}, 85%, 75%, ${this.opacity})`;
      ctx.fillText(this.runeChar, 0, 0);
      
      ctx.restore();
    }
  }
  
  // ===== INITIALIZE PARTICLES =====
  function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = new MysticParticle();
      p.y = Math.random() * canvas.height / (window.devicePixelRatio || 1);
      particles.push(p);
    }
  }
  
  // ===== SPAWN RUNE EFFECT =====
  function spawnRune() {
    if (!ENABLE_RUNES) return;
    
    const x = Math.random() * window.innerWidth * 0.8 + window.innerWidth * 0.1;
    const y = Math.random() * window.innerHeight * 0.6 + window.innerHeight * 0.2;
    runes.push(new MysticRune(x, y));
    
    // Optional: Create DOM sparkle element for extra flair
    if (Math.random() > 0.7) {
      createDOMSparkle(x, y);
    }
  }
  
  // ✅ UPDATED: DOM Sparkle with proper z-index layering (v2.7+)
  function createDOMSparkle(x, y) {
    const sparkle = document.createElement('span');
    sparkle.className = 'rune-sparkle';
    sparkle.textContent = ['✦', '✧', '◈', '❋'][Math.floor(Math.random() * 4)];
    
    // ✅ Z-INDEX FIX: Place above canvas (0), below interactive UI (100+)
    // Using cssText for performance and !important override safety
    sparkle.style.cssText = `
      position: fixed !important;
      left: ${x}px !important;
      top: ${y}px !important;
      z-index: 50 !important;
      pointer-events: none !important;
      font-size: 18px !important;
      color: hsla(30, 90%, 75%, 0.9) !important;
      text-shadow: 0 0 10px hsla(30, 90%, 70%, 0.8) !important;
      user-select: none !important;
      animation: sparkleFade 1.5s ease-out forwards !important;
      will-change: transform, opacity;
    `;
    
    document.body.appendChild(sparkle);
    
    // Auto-remove after animation completes
    setTimeout(() => {
      if (sparkle.parentNode) {
        sparkle.parentNode.removeChild(sparkle);
      }
    }, 1500);
  }
  
  // ===== ANIMATION LOOP =====
  let lastTime = 0;
  function animate(time) {
    const deltaTime = time - lastTime;
    lastTime = time;
    
    // Clear canvas (CRITICAL: maintain transparency for CSS background)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Subtle background mist effect (very low opacity - tavern atmosphere)
    ctx.fillStyle = 'rgba(26, 47, 58, 0.02)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw particles
    particles.forEach(p => {
      p.update(time);
      p.draw(ctx, time);
    });
    
    // Update and draw runes
    runes = runes.filter(rune => {
      const alive = rune.update();
      if (alive) rune.draw(ctx);
      return alive;
    });
    
    // Occasional magical sparkles (lantern-like)
    if (Math.random() < 0.02) {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      createDOMSparkle(x, y);
    }
    
    animationFrame = requestAnimationFrame(animate);
    if (ThemeManager?.trackAnimation) {
      ThemeManager.trackAnimation(animationFrame);
    }
  }
  
  // ===== START ANIMATIONS =====
  initParticles();
  animate(0);
  
  if (ENABLE_RUNES) {
    runeInterval = setInterval(spawnRune, RUNE_FREQUENCY);
    // Spawn a few initial runes for immediate visual impact
    for (let i = 0; i < 3; i++) {
      setTimeout(spawnRune, i * 500);
    }
  }
  
  // ===== REQUIRED CLEANUP FUNCTION (v2.7+ COMPLIANT) =====
  window.ThemeCleanup = function cleanup() {
    // Cancel animation frame
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    // Clear intervals/timeouts
    if (runeInterval) {
      clearInterval(runeInterval);
      runeInterval = null;
    }
    
    // Remove event listeners
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    
    // Remove any lingering DOM sparkles (cleanup safety net)
    document.querySelectorAll('.rune-sparkle').forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    
    // Clear canvas and reset transform (CRITICAL for theme switching)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Clear particle arrays to free memory
    particles = [];
    runes = [];
    
    // Reset canvas CSS to hidden state
    canvas.style.cssText = 'display:none;';
  };
  
  // Register with ThemeManager helpers if available (v2.7+ API)
  if (ThemeManager?.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      // Additional cleanup hooks can be added here if needed
    });
  }
  
  console.log('✨ Mystic Realm theme loaded - tavern ambiance active');
  
})();