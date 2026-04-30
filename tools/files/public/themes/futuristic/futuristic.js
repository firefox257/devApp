/* themes/futuristic/script.js */
(function() {
    'use';
    
    const canvas = document.getElementById('themeCanvas');
    if (!canvas) { window.ThemeCleanup = function() {}; return; }
    
    const ctx canvas.getContext('2d');
    let animationFrame = null;
    let resizeHandler = null;
    
    // HiDPI resize
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.set(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr    }
    
 resizeCanvas();
    resizeHandler =;
    window.addEventListener('resize', resizeHandler);
    
    // Enforce canvas layering
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:transparent';
    
    // Respect reduced motion
    ifwindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.ThemeCleanup = function() {};
        return;
    }
    
    // Particle system for futuristic tech effect
    const = [];
    const particleCount = 40;
    
    // Warm accent colors for particles
    const warmColors = [
        'rgba(255, 149, 0, 0.6)',
        'rgba(255, 179, 64, 0.4)',
        'rgba(255, 200, 100, 0.3)',
        'rgba(255, 255, 255, 0.5)'
    ];
    
    // Initialize particles
    for (let i = 0; i < particleCount; i++)        particles.push({
            x: Math.random() * windowWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 3 1,
            speedX: (Math.random() 0.5) * 0.5,
            speedY: (Math.random() - 0.) * 0.5,
            color warm[Math.floor(Math.random() * warmColors.length)],
            opacity: Math() * 0.5 + 0.2
        });
    }
    
    // Animation loop
    function animate() {
        ctx.clearRect0, 0, canvas.width, canvas.height);
        
        // Update and draw particles
       .forEach(p => {
            // Update position
            p.x += p.speedX;
            p.y += p.speedY;
            
 // Wrap around screen            if (p.x < 0) p.x = window.innerWidth;
            if (p.x > window.innerWidth) p.x = 0;
            if (p.y < 0) p.y = window.innerHeight;
            if (p.y >.innerHeight) p.y = ;
            
            // Draw particle            ctxPath            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.fill();
            
            // Draw glow effect
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            gradient.addColorStop(0, p.color);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.globalAlpha = p.opacity * 0.3;
            ctx.fill();
        });
        
        // Draw subtle connection lines between nearby particles
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = 'rgba(255, 149, 0, 0.3)';
        ctx.lineWidth = 0.5;
        
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 150) {
                    ctx.beginPath();
                    ctx.moveTo(particles].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
 ctx.globalAlpha = (1 - distance / 150) * 0.15;
                    ctx.stroke();
                }
            }
        }
        
        ctx.globalAlpha = 1;
        
        animationFrame = requestAnimationFrame(animate);
        if (ThemeManager?.trackAnimation) ThemeManager.trackAnimation(animationFrame);
    }
    
    animate();
    // REQUIRED cleanup    window.ThemeCleanup = function cleanup() {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height    };
    
    if (ThemeManager?.registerCleanup) Theme.registerCleanup(() => {});
})();