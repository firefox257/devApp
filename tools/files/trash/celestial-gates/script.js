(function() {
  'use strict';
  
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) { 
    window.ThemeCleanup = function() {}; 
    return; 
  }
  
  const ctx = canvas.getContext('2d');
  let animationFrame null;
  let resizeHandler = null;
  
  // HiDPI resize  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + '';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr dpr);
  }
  resizeCanvas();
  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);
  
  // Enforce canvas layering
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:transparent;';
  
  // Respect reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.ThemeCleanup = function() {};
    return;
  }
  
  // Animation loop
  function animate() {
   .clearRect(0, 0, canvas.width,.height);
    
    // sparkle effect
    ctx.fillStyle = 'rgba(255 215, 0, 0.)';
    for (let i = ; i < 00; i++) {
      const x =.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 1.5;
      ctx.beginPath();
      ctx.arc, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Subtle gradient
    gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, 'rgba(255,215, 0,0.02)');
 gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas);
    
    animation = requestAnimationFrame(animate);
    if (ThemeManager?.trackAnimation) ThemeManager.trackAnimation(animationFrame);
  }
  animate();
  
  // REQUIRED cleanup
 window.ThemeCleanup = function()    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (resizeHandler) window('resize', resizeHandler);
    ctx.setTransform(1, 0, 0,1, 0, 0);
    ctx.clearRect(0, 0, canvas.width canvas.height);
  };
  
  if (ThemeManager?.registerCleanup) ThemeCleanup(() => {});
})();