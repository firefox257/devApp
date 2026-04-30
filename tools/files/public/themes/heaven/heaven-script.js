(function() {
  'use strict';
  const canvas = document.getElementById('themeCanvas');
  if (!canvas) { window.ThemeCleanup = function() {}; return; }
  
  const ctx = canvas.getContext('2d');
  let animationFrame = null;
  let resizeHandler = null;
  let particles = [];
  
  const config = window.ThemeConfig?.heaven?.settings || {};
  const particleCount = config.particleCount ?? 30;
  const floatSpeed = config.floatSpeed ?? 0.8;
  
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    initParticles();
  }
  
  function initParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3 * floatSpeed,
        speedY: (Math.random() - 0.5) * 0.2 * floatSpeed,
        opacity: Math.random() * 0.4 + 0.1
      });
    }
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      
      if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
      if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
      ctx.fill();
    });
    
    animationFrame = requestAnimationFrame(animate);
    if (ThemeManager?.trackAnimation) ThemeManager.trackAnimation(animationFrame);
  }
  
  resizeCanvas();
  resizeHandler = resizeCanvas;
  window.addEventListener('resize', resizeHandler);
  
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:transparent;opacity:0.6;';
  
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animate();
  }
  
  window.ThemeCleanup = function cleanup() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = [];
  };
  
  if (ThemeManager?.registerCleanup) ThemeManager.registerCleanup(() => {});
})();