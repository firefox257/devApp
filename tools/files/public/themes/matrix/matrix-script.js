/**
 * Matrix Theme Script - Falling Code Rain Animation
 * ✅ Debug-friendly version with proper cleanup
 */
(function() {
  'use strict';
  
  console.log('🟢 Matrix theme script loading...');
  
  // ✅ Get canvas with better error handling
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) {
    console.error('❌ Matrix theme: #themeCanvas not found in DOM');
    console.error('   Check that themes.json has "canvas: true" for this theme');
    window.ThemeCleanup = function() { console.log('✓ Matrix cleanup (no-op)'); };
    return;
  }
  console.log('✓ Canvas element found:', canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('❌ Matrix theme: Could not get 2D context from canvas');
    window.ThemeCleanup = function() { console.log('✓ Matrix cleanup (no-op)'); };
    return;
  }
  console.log('✓ Canvas context acquired');

  // ✅ Track resources for cleanup
  const themeResources = {
    animationFrame: null,
    resizeHandlers: [],
    intervals: [],
    timeouts: [],
    canvas: canvas,
    ctx: ctx
  };

  // ✅ Helper: Register event listeners for cleanup tracking
  function addResizeHandler(handler) {
    window.addEventListener('resize', handler);
    themeResources.resizeHandlers.push(handler);
    console.log('  → Resize handler registered');
  }

  // ✅ Resize handling - ensure canvas fills screen
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(dpr, dpr); // Scale for HiDPI
    console.log('✓ Canvas resized:', canvas.width, 'x', canvas.height, '(DPR:', dpr + ')');
  }

  // Initial resize + register handler
  resizeCanvas();
  addResizeHandler(resizeCanvas);

  // ✅ Ensure canvas is visible and on top
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;background:transparent;';
  console.log('✓ Canvas styles applied');

  // Matrix characters (Katakana + alphanumeric)
  const matrixChars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charArray = matrixChars.split('');
  
  // Configuration
  const config = {
    fontSize: 14,
    fadeOpacity: 0.05,      // Trail fade effect
    brightChance: 0.975,    // Chance of bright white character
    resetChance: 0.975,     // Chance to reset drop at bottom
    wind: 0.2               // Subtle horizontal drift
  };

  // Drop management
  let drops = [];
  
  function initDrops() {
    const columns = Math.floor(window.innerWidth / config.fontSize);
    drops = [];
    for (let i = 0; i < columns; i++) {
      // Start drops at random positions above screen for natural look
      drops[i] = {
        y: Math.random() * -100,
        speed: 8 + Math.random() * 4
      };
    }
    console.log('✓ Initialized', drops.length, 'rain columns');
  }
  
  initDrops();
  addResizeHandler(initDrops);

  // ✅ Animation loop
  function drawMatrix() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const columns = Math.floor(width / config.fontSize);
    
    // Fade effect for trail (semi-transparent black)
    ctx.fillStyle = `rgba(0, 0, 0, ${config.fadeOpacity})`;
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${config.fontSize}px monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < columns && i < drops.length; i++) {
      // Random character
      const char = charArray[Math.floor(Math.random() * charArray.length)];
      
      // Bright white head, green trail
      ctx.fillStyle = Math.random() > config.brightChance ? '#ffffff' : '#00ff41';
      
      // Draw character
      const x = i * config.fontSize;
      const y = drops[i].y * config.fontSize;
      ctx.fillText(char, x, y);

      // Move drop down
      drops[i].y += drops[i].speed * 0.1;

      // Reset drop randomly after it goes off screen
      if (drops[i].y * config.fontSize > height && Math.random() > config.resetChance) {
        drops[i].y = Math.random() * -20;
        drops[i].speed = 8 + Math.random() * 4;
      }
    }

    // ✅ Track animation frame with ThemeManager
    themeResources.animationFrame = requestAnimationFrame(drawMatrix);
    if (typeof ThemeManager !== 'undefined' && ThemeManager.trackAnimation) {
      ThemeManager.trackAnimation(themeResources.animationFrame);
    }
  }

  // ✅ Start animation with delay to ensure DOM is ready
  setTimeout(() => {
    console.log('🟢 Starting Matrix animation...');
    drawMatrix();
    console.log('✓ Matrix rain animation running');
  }, 100);

  // ✅ EXPOSE CLEANUP VIA window.ThemeCleanup (REQUIRED)
  window.ThemeCleanup = function cleanup() {
    console.log('🔴 Matrix theme cleanup started');
    
    // Cancel animation frame
    if (themeResources.animationFrame) {
      cancelAnimationFrame(themeResources.animationFrame);
      themeResources.animationFrame = null;
      console.log('  ✓ Animation frame cancelled');
    }
    
    // Remove all resize listeners
    themeResources.resizeHandlers.forEach((handler, idx) => {
      try {
        window.removeEventListener('resize', handler);
        console.log('  ✓ Resize handler', idx+1, 'removed');
      } catch (e) {
        console.warn('  ⚠ Error removing handler:', e);
      }
    });
    themeResources.resizeHandlers = [];
    
    // Clear intervals/timeouts
    themeResources.intervals.forEach(id => { try { clearInterval(id); } catch(e) {} });
    themeResources.intervals = [];
    themeResources.timeouts.forEach(id => { try { clearTimeout(id); } catch(e) {} });
    themeResources.timeouts = [];
    
    // Clear canvas thoroughly
    try {
      const ctx = themeResources.ctx;
      const canvas = themeResources.canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      console.log('  ✓ Canvas cleared');
    } catch (e) {
      console.warn('  ⚠ Error clearing canvas:', e);
    }
    
    // Free memory
    drops = [];
    
    console.log('🔴 Matrix theme cleanup complete');
  };
  
  // ✅ Also register via cleanup registry (optional but recommended)
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('✓ Matrix registry cleanup hook');
    });
  }
  
  console.log('🟢 Matrix theme script loaded successfully');
  
})();