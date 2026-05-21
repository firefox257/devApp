(function() {
    'use strict';
    
    const canvas = document.getElementById('themeCanvas');
    if (!canvas) { 
        window.ThemeCleanup = function() {}; 
        return; 
    }
    
    const ctx = canvas.getContext('2d');
    let animationFrame = null;
    let resizeHandler = null;
    let orientationHandler = null;
    let particles = [];
    let tiltX = 0;
    let tiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let permissionGranted = false;
    
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
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;background:transparent;';
    
    // Create 3D TRON City with visible buildings
    function createTRONCity() {
        if (document.getElementById('tron-3d-wrapper')) return;
        
        const wrapper = document.createElement('div');
        wrapper.id = 'tron-3d-wrapper';
        
        const scene = document.createElement('div');
        scene.id = 'tron-3d-scene';
        
        // Create ground grid
        const grid = document.createElement('div');
        grid.className = 'tron-grid';
        
        // Create city container
        const city = document.createElement('div');
        city.className = 'tron-city';
        
        // Create horizon glow
        const horizon = document.createElement('div');
        horizon.className = 'tron-horizon';
        
        // Generate multiple buildings
        const buildingData = [
            { x: 10, z: -200, w: 80, h: 250, d: 80 },
            { x: 25, z: -300, w: 60, h: 180, d: 60 },
            { x: 40, z: -150, w: 100, h: 300, d: 100 },
            { x: 60, z: -250, w: 70, h: 220, d: 70 },
            { x: 80, z: -180, w: 90, h: 280, d: 90 },
            { x: 5, z: -400, w: 50, h: 150, d: 50 },
            { x: 95, z: -350, w: 55, h: 160, d: 55 },
            { x: 35, z: -450, w: 65, h: 200, d: 65 },
            { x: 70, z: -400, w: 75, h: 240, d: 75 },
            { x: 15, z: -100, w: 85, h: 260, d: 85 },
            { x: 50, z: -350, w: 95, h: 290, d: 95 },
            { x: 85, z: -280, w: 68, h: 210, d: 68 }
        ];
        
        buildingData.forEach((data, index) => {
            const building = createBuilding(data, index);
            city.appendChild(building);
        });
        
        scene.appendChild(grid);
        scene.appendChild(horizon);
        scene.appendChild(city);
        wrapper.appendChild(scene);
        document.body.appendChild(wrapper);
        
        console.log('TRON City: 3D buildings created');
    }
    
    // Create a single 3D building
    function createBuilding(data, index) {
        const building = document.createElement('div');
        building.className = 'tron-building';
        
        const { x, z, w, h, d } = data;
        
        // Position building in 3D space
        building.style.left = x + '%';
        building.style.transform = `translateZ(${z}px)`;
        
        // Create building faces
        const faces = [
            // Front face
            { 
                transform: `translateZ(${d/2}px)`, 
                width: w, 
                height: h,
                left: -w/2,
                bottom: 0
            },
            // Back face
            { 
                transform: `rotateY(180deg) translateZ(${d/2}px)`, 
                width: w, 
                height: h,
                left: -w/2,
                bottom: 0
            },
            // Right face
            { 
                transform: `rotateY(90deg) translateZ(${w/2}px)`, 
                width: d, 
                height: h,
                left: 0,
                bottom: 0
            },
            // Left face
            { 
                transform: `rotateY(-90deg) translateZ(${w/2}px)`, 
                width: d, 
                height: h,
                left: -d,
                bottom: 0
            },
            // Top face
            { 
                transform: `rotateX(90deg) translateZ(${h/2}px)`, 
                width: w, 
                height: d,
                left: -w/2,
                bottom: h
            }
        ];
        
        faces.forEach((face, faceIndex) => {
            const faceEl = document.createElement('div');
            faceEl.className = 'tron-building__face' + (faceIndex === 4 ? ' tron-building__face--top' : '');
            faceEl.style.cssText = `
                transform: ${face.transform};
                width: ${face.width}px;
                height: ${face.height}px;
                left: ${face.left}px;
                bottom: ${face.bottom}px;
            `;
            building.appendChild(faceEl);
        });
        
        return building;
    }
    
    function handleOrientation(event) {
        if (event.gamma !== null && event.beta !== null) {
            targetTiltY = Math.max(-45, Math.min(45, event.gamma));
            targetTiltX = Math.max(-45, Math.min(45, event.beta - 45));
            
            if (!permissionGranted) {
                permissionGranted = true;
                console.log('TRON City: Gyroscope active');
            }
        }
    }
    
    async function requestGyroscopePermission() {
        console.log('TRON City: Requesting permission...');
        
        if (typeof DeviceOrientationEvent === 'undefined') {
            console.warn('TRON City: Not supported');
            setupMouseFallback();
            return;
        }
        
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    orientationHandler = handleOrientation;
                    window.addEventListener('deviceorientation', orientationHandler);
                    createTRONCity();
                } else {
                    setupMouseFallback();
                }
            } catch (error) {
                console.error('TRON City: Error:', error);
                setupMouseFallback();
            }
        } else {
            orientationHandler = handleOrientation;
            window.addEventListener('deviceorientation', orientationHandler);
            createTRONCity();
        }
    }
    
    function createPermissionButton() {
        if (document.getElementById('tron-permission-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'tron-permission-btn';
        btn.textContent = 'Enable 3D Motion';
        btn.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px 40px;
            font-size: 18px;
            font-family: 'Orbitron', sans-serif;
            background: rgba(0, 212, 255, 0.9);
            color: #000;
            border: 2px solid #00ffff;
            border-radius: 8px;
            cursor: pointer;
            z-index: 10000;
            box-shadow: 0 0 30px rgba(0, 212, 255, 0.6);
            text-transform: uppercase;
            letter-spacing: 2px;
        `;
        
        btn.addEventListener('click', async function() {
            btn.style.display = 'none';
            await requestGyroscopePermission();
        });
        
        document.body.appendChild(btn);
        
        if (typeof DeviceOrientationEvent === 'undefined' || 
            typeof DeviceOrientationEvent.requestPermission !== 'function') {
            setTimeout(() => { btn.style.display = 'none'; }, 5000);
        }
    }
    
    function setupMouseFallback() {
        console.log('TRON City: Mouse fallback');
        document.addEventListener('mousemove', (e) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            targetTiltY = ((e.clientX - centerX) / centerX) * 30;
            targetTiltX = -((e.clientY - centerY) / centerY) * 30;
            
            if (!permissionGranted) {
                permissionGranted = true;
                createTRONCity();
            }
        });
        createTRONCity();
    }
    
    function initGyroscope() {
        console.log('TRON City: Initializing...');
        createPermissionButton();
        
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission !== 'function') {
            requestGyroscopePermission();
        }
    }
    
    class Particle {
        constructor() {
            this.reset();
        }
        
        reset() {
            this.x = Math.random() * canvas.width / (window.devicePixelRatio || 1);
            this.y = Math.random() * canvas.height / (window.devicePixelRatio || 1);
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 2 + 1;
            this.alpha = Math.random() * 0.5 + 0.2;
            this.fadeSpeed = Math.random() * 0.01 + 0.005;
            this.growing = true;
        }
        
        update() {
            this.x += this.vx;
            this.y += this.vy;
            
            if (this.growing) {
                this.alpha += this.fadeSpeed;
                if (this.alpha >= 0.8) this.growing = false;
            } else {
                this.alpha -= this.fadeSpeed;
                if (this.alpha <= 0.1) this.reset();
            }
            
            if (this.x < 0) this.x = canvas.width / (window.devicePixelRatio || 1);
            if (this.x > canvas.width / (window.devicePixelRatio || 1)) this.x = 0;
            if (this.y < 0) this.y = canvas.height / (window.devicePixelRatio || 1);
            if (this.y > canvas.height / (window.devicePixelRatio || 1)) this.y = 0;
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 212, 255, ${this.alpha})`;
            ctx.fill();
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(0, 212, 255, 0.8)';
        }
    }
    
    function initParticles() {
        particles = [];
        for (let i = 0; i < 50; i++) {
            particles.push(new Particle());
        }
    }
    
    function drawConnections() {
        const maxDistance = 150;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < maxDistance) {
                    const alpha = (1 - distance / maxDistance) * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
    }
    
    function updateTilt() {
        const smoothing = 0.1;
        tiltX += (targetTiltX - tiltX) * smoothing;
        tiltY += (targetTiltY - tiltY) * smoothing;
        
        const scene = document.getElementById('tron-3d-scene');
        if (scene) {
            scene.style.transform = `rotateY(${tiltY}deg) rotateX(${-tiltX}deg)`;
        }
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
        
        drawConnections();
        updateTilt();
        
        animationFrame = requestAnimationFrame(animate);
        if (ThemeManager?.trackAnimation) ThemeManager.trackAnimation(animationFrame);
    }
    
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        initGyroscope();
        window.ThemeCleanup = function() {};
        return;
    }
    
    console.log('TRON City: Starting...');
    initGyroscope();
    initParticles();
    animate();
    
    window.ThemeCleanup = function cleanup() {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        if (orientationHandler) window.removeEventListener('deviceorientation', orientationHandler);
        
        const wrapper = document.getElementById('tron-3d-wrapper');
        if (wrapper) wrapper.remove();
        
        const btn = document.getElementById('tron-permission-btn');
        if (btn) btn.remove();
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    
    if (ThemeManager?.registerCleanup) ThemeManager.registerCleanup(() => {});
})();