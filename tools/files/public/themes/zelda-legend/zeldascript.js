(function() {
  'use strict';
  
  // ==========================================================================
  // LEGEND OF ZELDA THEME - ENHANCED GLOWING PARTICLE ANIMATION SCRIPT
  // Material Icons OS v2.7+ | Mobile-First | Magical Amber Hearts with Glow + Twinkle
  // ==========================================================================
  
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) { 
    window.ThemeCleanup = function() {}; 
    return; 
  }
  
  const ctx = canvas.getContext('2d');
  let animationFrame = null;
  let resizeHandler = null;
  let hearts = [];
  
  // Access theme settings from ThemeConfig
  const themeId = 'zelda-legend';
  const config = window.ThemeConfig?.[themeId]?.settings || {};
  const particleCount = config.particleCount ?? 30; /* Increased slightly for better glow density */
  const showParticles = config.particles !== false;
  const glowIntensity = config.glowIntensity ?? 0.8; /* 0.5 - 1.0 for glow strength */
  
  // ==========================================================================
  // HI-DPI CANVAS RESIZE HANDLER
  // ==========================================================================
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    // Enable anti-aliasing for smoother glow edges
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  
  // Initialize canvas size
  resizeCanvas();
  
  // Store reference for cleanup
  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);
  
  // ==========================================================================
  // ENFORCE CANVAS LAYERING & TRANSPARENCY (REQUIRED v2.7+)
  // ==========================================================================
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:transparent;opacity:0.7;';
  
  // ==========================================================================
  // RESPECT USER PREFERENCE: REDUCED MOTION
  // ==========================================================================
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.ThemeCleanup = function() {};
    return; // Exit early - no animation needed
  }
  
  // ==========================================================================
  // ENHANCED COZY AMBER HEART COLOR PALETTE WITH VARIATION
  // Whitish amber glow range - warm lantern/firelight aesthetic with subtle hue shifts
  // ==========================================================================
  const amberPalette = [
    { core: 'rgba(255, 245, 230, 0.35)', mid: 'rgba(255, 220, 180, 0.25)', outer: 'rgba(255, 195, 140, 0.15)' },   // Cream-golden
    { core: 'rgba(255, 235, 200, 0.30)', mid: 'rgba(255, 210, 160, 0.22)', outer: 'rgba(255, 180, 120, 0.12)' },   // Warm amber
    { core: 'rgba(255, 250, 240, 0.25)', mid: 'rgba(255, 225, 200, 0.20)', outer: 'rgba(255, 200, 170, 0.10)' },  // Soft white-gold
    { core: 'rgba(255, 230, 190, 0.32)', mid: 'rgba(255, 205, 150, 0.24)', outer: 'rgba(255, 175, 110, 0.14)' },  // Rich honey
    { core: 'rgba(255, 240, 215, 0.28)', mid: 'rgba(255, 215, 170, 0.21)', outer: 'rgba(255, 185, 130, 0.11)' }   // Gentle peach-gold
  ];
  
  // ==========================================================================
  // DRAW HEART SHAPE WITH MULTI-LAYER ENHANCED GLOW EFFECT
  // Uses composite operations for additive glow stacking
  // ==========================================================================
  function drawHeart(x, y, size, twinkleValue) {
    const glowScale = glowIntensity * twinkleValue; /* Twinkle modulates glow strength */
    
    // Base heart path (drawn multiple times with different blends)
    const createHeartPath = () => {
      ctx.beginPath();
      ctx.moveTo(x, y + size / 2);
      ctx.bezierCurveTo(
        x, y + size * 0.8, 
        x + size / 2, y + size, 
        x + size / 2, y + size * 0.6
      );
      ctx.bezierCurveTo(
        x + size, y + size * 0.2, 
        x + size, y, 
        x + size / 2, y
      );
      ctx.bezierCurveTo(
        x, y, 
        x, y + size * 0.2, 
        x, y + size / 2
      );
    };
    
    // =========================================================================
    // FIVE-LAYER ADDITIVE GLOW SYSTEM (Core → Outer Halo)
    // Uses 'screen' blend mode for luminous stacking effect
    // =========================================================================
    
    // Layer 1: Innermost Core (Brightest White-Cream) - Tightest blur
    ctx.globalCompositeOperation = 'screen'; /* Additive blending for light */
    createHeartPath();
    ctx.shadowColor = 'rgba(255, 250, 245, 0.5)';
    ctx.shadowBlur = 12 * glowScale;
    ctx.fillStyle = 'rgba(255, 248, 245, 0.4)';
    ctx.fill();
    
    // Layer 2: Bright Core (Golden Amber) - Medium blur
    createHeartPath();
    ctx.shadowColor = 'rgba(255, 235, 200, 0.45)';
    ctx.shadowBlur = 20 * glowScale;
    ctx.fillStyle = 'rgba(255, 232, 190, 0.3)';
    ctx.fill();
    
    // Layer 3: Mid-Glow (Rich Amber) - Wider diffusion
    createHeartPath();
    ctx.shadowColor = 'rgba(255, 210, 150, 0.40)';
    ctx.shadowBlur = 35 * glowScale;
    ctx.fillStyle = 'rgba(255, 205, 140, 0.22)';
    ctx.fill();
    
    // Layer 4: Outer Glow (Soft Orange-Gold) - Broad halo
    createHeartPath();
    ctx.shadowColor = 'rgba(255, 185, 120, 0.35)';
    ctx.shadowBlur = 55 * glowScale;
    ctx.fillStyle = 'rgba(255, 180, 110, 0.15)';
    ctx.fill();
    
    // Layer 5: Distant Halo (Deep Amber Trail) - Widest spread
    createHeartPath();
    ctx.shadowColor = 'rgba(255, 160, 90, 0.30)';
    ctx.shadowBlur = 80 * glowScale;
    ctx.fillStyle = 'rgba(255, 155, 85, 0.08)';
    ctx.fill();
    
    // Reset composite operation for other drawing
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }
  
  // ==========================================================================
  // ENHANCED HEART PARTICLE CLASS WITH TWINKLING
  // ==========================================================================
  class HeartParticle {
    constructor() {
      this.reset();
    }
    
    reset() {
      // Random horizontal position across screen width
      this.x = Math.random() * window.innerWidth;
      
      // Start below visible area, drift upward
      this.y = window.innerHeight + Math.random() * 300;
      
      // Size variation (8-24px for noticeable glow presence)
      this.size = 8 + Math.random() * 16;
      
      // Slow float speed for cozy atmosphere (0.15-0.5 px/frame)
      this.speed = 0.15 + Math.random() * 0.35;
      
      // Transparent opacity for subtle background presence
      this.baseOpacity = 0.12 + Math.random() * 0.28;
      
      // Gentle left-right sway with occasional bursts
      this.driftBase = (Math.random() - 0.5) * 0.2;
      this.driftSpeed = 0.003 + Math.random() * 0.005;
      this.driftOffset = Math.random() * Math.PI * 2;
      
      // Randomize color selection from palette
      this.colorIndex = Math.floor(Math.random() * amberPalette.length);
      
      // ==========================================================================
      // TWINKLING PARAMETERS (Multiple oscillators for natural effect)
      // ==========================================================================
      
      // Primary pulse (slower breath-like rhythm)
      this.twinklePhase1 = Math.random() * Math.PI * 2;
      this.twinkleSpeed1 = 0.008 + Math.random() * 0.012; /* Slower pulse */
      this.twinkleAmp1 = 0.15 + Math.random() * 0.20;     /* Amplitude 0.15-0.35 total */
      
      // Secondary shimmer (faster flicker like candle flame)
      this.twinklePhase2 = Math.random() * Math.PI * 2;
      this.twinkleSpeed2 = 0.025 + Math.random() * 0.035; /* Faster flicker */
      this.twinkleAmp2 = 0.08 + Math.random() * 0.12;     /* Subtle variation */
      
      // Occasional bright spark (rare intense glows)
      this.sparkTimer = 30 + Math.random() * 90; /* Frames until next spark */
      this.sparkDuration = 0;
      this.sparkIntensity = 0;
      
      // Track current twinkle multiplier (1.0 = normal, >1.0 = brighter)
      this.currentTwinkle = 1.0;
      
      // Track current opacity during animation
      this.currentOpacity = this.baseOpacity;
      
      // Growth/shrink cycle for added organic feel (optional)
      this.growthPhase = Math.random() * Math.PI * 2;
      this.growthSpeed = 0.002 + Math.random() * 0.003;
      this.growthSize = this.size;
    }
    
    update() {
      // Move upward slowly
      this.y -= this.speed;
      
      // Organic horizontal drift (sine wave based)
      this.driftOffset += this.driftSpeed;
      this.x += this.driftBase + Math.sin(this.driftOffset) * 0.15;
      
      // ==========================================================================
      // TWINKLE CALCULATION (Two-phase oscillator)
      // ==========================================================================
      
      // Update primary phase (breathing pulse)
      this.twinklePhase1 += this.twinkleSpeed1;
      const pulse1 = (Math.sin(this.twinklePhase1) + 1) / 2; /* 0-1 range */
      const twinkle1 = pulse1 * this.twinkleAmp1;
      
      // Update secondary phase (quick shimmer)
      this.twinklePhase2 += this.twinkleSpeed2;
      const pulse2 = (Math.sin(this.twinklePhase2) + 1) / 2; /* 0-1 range */
      const twinkle2 = pulse2 * this.twinkleAmp2;
      
      // Combine both phases for final twinkle value
      this.currentTwinkle = 1.0 + twinkle1 + twinkle2; /* Range: ~0.7-1.5x */
      
      // Cap extreme values for stability
      this.currentTwinkle = Math.max(0.7, Math.min(1.6, this.currentTwinkle));
      
      // ==========================================================================
      // SPARK FLICKER (Occasional intense bright moments)
      // ==========================================================================
      if (this.sparkDuration > 0) {
        this.sparkDuration--;
        this.sparkIntensity *= 0.95; /* Fade out quickly */
        if (this.sparkDuration <= 0) {
          this.sparkIntensity = 0;
        }
      } else if (--this.sparkTimer <= 0) {
        // Trigger new spark
        this.sparkTimer = 60 + Math.random() * 120; /* Next spark in 1-3 seconds */
        this.sparkDuration = 8 + Math.random() * 8; /* Spark lasts 0.13-0.27 seconds */
        this.sparkIntensity = 0.3 + Math.random() * 0.4; /* Instant brightness boost */
      }
      
      // Apply spark bonus to twinkle
      this.currentTwinkle += this.sparkIntensity;
      
      // Calculate final opacity with twinkle influence
      this.currentOpacity = this.baseOpacity * (0.7 + (this.currentTwinkle - 1.0) * 1.5);
      this.currentOpacity = Math.max(0.08, Math.min(0.55, this.currentOpacity));
      
      // Optional: subtle size growth/oscillation
      this.growthPhase += this.growthSpeed;
      this.growthSize = this.size + Math.sin(this.growthPhase) * 1.5;
      
      // Reset when floated beyond top of screen
      if (this.y < -80) {
        this.reset();
      }
    }
    
    draw() {
      // Apply current pulse opacity
      ctx.globalAlpha = this.currentOpacity;
      
      // Draw glowing heart with current twinkle value
      drawHeart(this.x, this.y, this.growthSize, this.currentTwinkle);
      
      // Reset global alpha
      ctx.globalAlpha = 1;
    }
  }
  
  // ==========================================================================
  // INITIALIZE PARTICLES
  // ==========================================================================
  if (showParticles) {
    for (let i = 0; i < particleCount; i++) {
      hearts.push(new HeartParticle());
    }
  }
  
  // ==========================================================================
  // ANIMATION LOOP (RequestAnimationFrame)
  // ==========================================================================
  function animate() {
    if (!showParticles) return;
    
    // Clear entire canvas each frame (REQUIREMENT - never fillRect!)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw all particles
    hearts.forEach(heart => {
      heart.update();
      heart.draw();
    });
    
    // Schedule next frame
    animationFrame = requestAnimationFrame(animate);
    
    // Track with ThemeManager for automatic cleanup
    if (ThemeManager?.trackAnimation) {
      ThemeManager.trackAnimation(animationFrame);
    }
  }
  
  // Start animation
  animate();
  
  // ==========================================================================
  // REQUIRED CLEANUP FUNCTION (CRITICAL FOR THEME SWITCHING)
  // ==========================================================================
  // This must be set at global scope for ThemeManager to find it
  window.ThemeCleanup = function cleanup() {
    // Cancel animation loop
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    
    // Remove resize event listener
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
    }
    
    // Reset canvas transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Clear canvas completely
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Clear particle arrays to free memory
    hearts = [];
    amberPalette = [];
    
    console.log('[Zelda Theme] Cleanup completed - enhanced glowing hearts stopped');
  };
  
  // Register with ThemeManager if available (automatic tracking)
  if (ThemeManager?.registerCleanup) {
    ThemeManager.registerCleanup(() => {});
  }
  
  // ==========================================================================
  // DEBUG LOG (Optional - remove in production)
  // ==========================================================================
  console.log('[Zelda Theme] Enhanced glowing hearts initialized:', {
    particleCount: hearts.length,
    reducedMotion: !showParticles,
    glowIntensity: glowIntensity,
    version: '2.8.0 - Enhanced Glow Edition'
  });
  
})();