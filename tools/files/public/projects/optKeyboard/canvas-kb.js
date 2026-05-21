// canvas-kb.js
export function initCanvasKeyboard(canvasId, containerId, optKb) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d', { alpha: false });
  const container = document.getElementById(containerId);
  const status = document.getElementById('status');
  
  let keys = [], activeKey = null, shiftOn = false, isSymbols = false, activeEmojiCategory = 'faces';

  // ⏱️ Repeat Configuration
  const REPEAT_DELAY = 350;      // ms before auto-repeat starts
  const REPEAT_INTERVAL = 50;    // ms between subsequent repeats

  // 🔁 Repeat State
  let repeatTimer = null;

  function startRepeat(callback) {
    if (repeatTimer) clearTimeout(repeatTimer);
    const tick = () => {
      if (activeKey) {
        callback();
        repeatTimer = setTimeout(tick, REPEAT_INTERVAL);
      }
    };
    repeatTimer = setTimeout(tick, REPEAT_DELAY);
  }

  function stopRepeat() {
    if (repeatTimer) {
      clearTimeout(repeatTimer);
      repeatTimer = null;
    }
  }

  optKb.onShow = () => {
    container.style.display = 'block';
    void container.offsetHeight;
    requestAnimationFrame(() => { setupCanvas(); buildKeys(); draw(); });
  };
  optKb.onHide = () => { 
    stopRepeat(); 
    container.style.display = 'none'; 
    activeKey = null; 
  };

  // 📦 Category definitions - add as many as you want!
  const emojiCategories = {
    faces: { label: '😀', title: 'Faces', items: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪'] },
    math: { label: '∑', title: 'Math', items: ['+','-','*','×','÷','/','=','≠','≈','≤','≥','±','∞','π','√','∫','∂','∑','∏','∇','∈','∉','∀','∃','∅','⊂','⊃','⊆','⊇','⊕','⊗','⊥','∠','∥','∦','∧','∨','∩','∪'] },
    symbols: { label: '✳️', title: 'Symbols', items: ['©','®','™','§','¶','•','◦','†','‡','‰','′','″','‾','⁄','€','£','¥','¢','¤','¦','¨','¯','°','±','²','³','´','µ','¶','·','¸','¹','º','»','¼','½','¾','¿','×','÷'] },
    // ➕ Add more categories freely:
    animals: { label: '🐾', title: 'Animals', items: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼'] },
    travel: { label: '✈️', title: 'Travel', items: ['🚗','🚌','🚕','🚙','🚲','🛴','🚲','✈️','🚀'] },
  };

  const layouts = {
    abc: {
      top: ['⇥', '"', "'", '`', '{', '}', '[', ']', '(', ')', ';', '⌨'],
      rows: [['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],['⇧','z','x','c','v','b','n','m','⌫'],['123', ',', ' ', '.', '⏎']]
    },
    sym: {
      top: ['+','-','*','/','=','~','^','%','&','|','\\','⌨'],
      rows: [['1','2','3','4','5','6','7','8','9','0'],['!','@','#','$','%','^','&','*','(',')','⌫'],['⇧','<','>',':',';','\'','"','?','_','|'],['ABC', ',', ' ', '.', '⏎']]
    }
  };

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildKeys() {
    keys = [];
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const pad = 4, gap = 4;

    // ─── ABC Mode ───
    if (!isSymbols) {
      const layout = layouts.abc; let y = pad;
      const topH = 32, topW = (w - pad * 2 - gap * (layout.top.length - 1)) / layout.top.length;
      let x = pad;
      layout.top.forEach(lbl => { keys.push({ x, y, w: topW, h: topH, label: lbl, isTop: true, pressed: false }); x += topW + gap; });
      y += topH + gap;
      const mainH = Math.max((h - y - pad) / 4, 30);
      layout.rows.forEach(row => {
        const units = row.reduce((s, k) => k === ' ' ? s + 5 : ['⇧', '⌫', '123', 'ABC', '⏎'].includes(k) ? s + 1.5 : s + 1, 0);
        const uW = (w - pad * 2 - gap * (row.length - 1)) / units;
        let x = pad;
        row.forEach(lbl => {
          const u = lbl === ' ' ? 5 : ['⇧', '⌫', '123', 'ABC', '⏎'].includes(lbl) ? 1.5 : 1;
          keys.push({ x, y, w: uW * u, h: mainH, label: lbl, isLetter: /[a-z]/i.test(lbl), pressed: false });
          x += uW * u + gap;
        });
        y += mainH + gap;
      });
      return;
    }

    // ─── SYM Mode (no shift) ───
    if (!shiftOn) {
      const layout = layouts.sym; let y = pad;
      const topH = 32, topW = (w - pad * 2 - gap * (layout.top.length - 1)) / layout.top.length;
      let x = pad;
      layout.top.forEach(lbl => { keys.push({ x, y, w: topW, h: topH, label: lbl, isTop: true, pressed: false }); x += topW + gap; });
      y += topH + gap;
      const mainH = Math.max((h - y - pad) / 4, 30);
      layout.rows.forEach(row => {
        const units = row.reduce((s, k) => k === ' ' ? s + 5 : ['⇧', '⌫', '123', 'ABC', '⏎'].includes(k) ? s + 1.5 : s + 1, 0);
        const uW = (w - pad * 2 - gap * (row.length - 1)) / units;
        let x = pad;
        row.forEach(lbl => {
          const u = lbl === ' ' ? 5 : ['⇧', '⌫', '123', 'ABC', '⏎'].includes(lbl) ? 1.5 : 1;
          keys.push({ x, y, w: uW * u, h: mainH, label: lbl, pressed: false });
          x += uW * u + gap;
        });
        y += mainH + gap;
      });
      return;
    }

    // ─── SYM+SHIFT Mode: Emoji/Symbol Browser with Arrow Navigation ───
    const catRowH = 34, navRowH = 32; 
    let y = pad;

    // 🔄 Category Navigation: ← [Title] →
    const catIds = Object.keys(emojiCategories);
    const currentIndex = catIds.indexOf(activeEmojiCategory);
    const prevCat = catIds[(currentIndex - 1 + catIds.length) % catIds.length];
    const nextCat = catIds[(currentIndex + 1) % catIds.length];
    const currentCat = emojiCategories[activeEmojiCategory];

    const navW = 48; // Arrow button width
    const labelW = w - pad * 2 - navW * 2 - gap * 2;
    const labelX = pad + navW + gap;

    // ← Back arrow
    keys.push({ 
      x: pad, y, w: navW, h: catRowH, 
      label: '◂', isCatNav: true, navDir: -1, pressed: false 
    });

    // Category title label (display only)
    keys.push({ 
      x: labelX, y, w: labelW, h: catRowH, 
      label: currentCat.title, isCatLabel: true, pressed: false 
    });

    // → Forward arrow  
    keys.push({ 
      x: labelX + labelW + gap, y, w: navW, h: catRowH, 
      label: '▸', isCatNav: true, navDir: 1, pressed: false 
    });

    y += catRowH + gap;

    // 📦 Emoji Grid
    const gridH = h - y - navRowH - pad;
    const emojiH = 36, cols = 8;
    const rows = Math.max(3, Math.floor((gridH + gap) / (emojiH + gap)));
    const emojiW = (w - pad * 2 - gap * (cols - 1)) / cols;
    const items = currentCat.items; 
    let idx = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx < items.length) {
          keys.push({ 
            x: pad + c * (emojiW + gap), 
            y: y + r * (emojiH + gap), 
            w: emojiW, h: emojiH, 
            label: items[idx], 
            isEmojiItem: true, 
            pressed: false 
          }); 
          idx++;
        }
      }
    }

    y += rows * (emojiH + gap) - gap + gap;

    // ⚙️ Bottom Nav Row
    const nav = [
      { l: 'ABC', w: 1.5, a: 'mode' }, 
      { l: '⌫', w: 1.5, a: 'delete' }, 
      { l: ' ', w: 4, a: 'space' }, 
      { l: '⏎', w: 2, a: 'enter' }
    ];
    const totU = nav.reduce((s, k) => s + k.w, 0);
    const uW = (w - pad * 2 - gap * (nav.length - 1)) / totU; 
    let nx = pad;

    nav.forEach(n => { 
      keys.push({ 
        x: nx, y, w: uW * n.w, h: navRowH, 
        label: n.l, isNavKey: true, navAction: n.a, pressed: false 
      }); 
      nx += uW * n.w + gap; 
    });
  }

  function draw() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    
    // Background
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, w, h);

    keys.forEach(k => {
      // Determine display label
      let disp = k.label;
      if (k.isLetter && !isSymbols) disp = shiftOn ? k.label.toUpperCase() : k.label.toLowerCase();
      if (k.label === '⇧') disp = shiftOn ? '▲' : '⇧';

      // ✨ Visual state flags
      const isCatNav = k.isCatNav;
      const isCatLabel = k.isCatLabel;
      const isEm = k.isEmojiItem;
      const isNav = k.isNavKey;
      const isShift = k.label === '⇧' && shiftOn;

      // Background colors
      if (isCatLabel) {
        ctx.fillStyle = 'transparent';
        ctx.strokeStyle = 'transparent';
      } else if (isCatNav) {
        ctx.fillStyle = k.pressed ? '#3b82f6' : '#1e3a5f';
        ctx.strokeStyle = '#60a5fa';
      } else if (isEm) {
        ctx.fillStyle = k.pressed ? '#334155' : '#1e293b';
        ctx.strokeStyle = '#334155';
      } else if (isNav) {
        ctx.fillStyle = k.pressed ? '#334155' : '#475569';
        ctx.strokeStyle = '#334155';
      } else {
        ctx.fillStyle = k.pressed ? '#334155' : (k.label === '⌨' ? '#b91c1c' : (isShift ? '#2563eb' : '#1e293b'));
        ctx.strokeStyle = '#334155';
      }

      // Draw key background (skip for labels)
      if (!isCatLabel) {
        ctx.lineWidth = 1; 
        const r = isCatNav || isNav ? 4 : 5;
        ctx.beginPath(); 
        ctx.moveTo(k.x + r, k.y); 
        ctx.lineTo(k.x + k.w - r, k.y); 
        ctx.quadraticCurveTo(k.x + k.w, k.y, k.x + k.w, k.y + r);
        ctx.lineTo(k.x + k.w, k.y + k.h - r); 
        ctx.quadraticCurveTo(k.x + k.w, k.y + k.h, k.x + k.w - r, k.y + k.h);
        ctx.lineTo(k.x + r, k.y + k.h); 
        ctx.quadraticCurveTo(k.x, k.y + k.h, k.x, k.y + k.h - r);
        ctx.lineTo(k.x, k.y + r); 
        ctx.quadraticCurveTo(k.x, k.y, k.x + r, k.y); 
        ctx.closePath(); 
        ctx.fill(); 
        ctx.stroke();
      }

      // Text styling
      if (isCatNav) {
        ctx.font = `bold ${k.h * 0.5}px -apple-system, monospace`;
        ctx.fillStyle = '#93c5fd';
      } else if (isCatLabel) {
        ctx.font = `600 ${k.h * 0.45}px -apple-system, sans-serif`;
        ctx.fillStyle = '#cbd5e1';
      } else if (isEm) {
        ctx.font = `${k.h * 0.75}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.fillStyle = '#cbd5e1';
      } else if (isNav) {
        ctx.font = `bold ${k.h * 0.4}px -apple-system, monospace`;
        ctx.fillStyle = '#fff';
      } else {
        ctx.font = (k.isLetter || /[a-z]/i.test(k.label)) 
          ? `bold ${k.h * 0.42}px -apple-system, monospace` 
          : `bold ${k.h * 0.38}px -apple-system, monospace`;
        ctx.fillStyle = (isShift || k.label === '⌨' || ['123', 'ABC'].includes(k.label)) ? '#fff' : '#cbd5e1';
      }

      ctx.textAlign = 'center'; 
      ctx.textBaseline = 'middle'; 
      ctx.fillText(disp, k.x + k.w / 2, k.y + k.h / 2);
    });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.type === 'touchend' ? e.changedTouches[0] : (e.touches?.[0] || e);
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  
  function findKey(pos) { 
    return keys.find(k => pos.x >= k.x && pos.x <= k.x + k.w && pos.y >= k.y && pos.y <= k.y + k.h) || null; 
  }
  
  function isSameKey(k1, k2) {
    if (!k1 || !k2) return false;
    return k1.label === k2.label && k1.navAction === k2.navAction && k1.isEmojiItem === k2.isEmojiItem;
  }

  function handleStart(e) {
    e.preventDefault();
    const pos = getPos(e);
    const key = findKey(pos);
    if (key) {
      stopRepeat();
      if (activeKey) activeKey.pressed = false;
      
      key.pressed = true;
      activeKey = key;
      draw();

      processKey(key);
      startRepeat(() => processKey(key));
    }
  }

  function handleMove(e) {
    e.preventDefault();
    if (!activeKey) return;
    const pos = getPos(e);
    const currentKey = findKey(pos);

    if (!isSameKey(currentKey, activeKey)) {
      stopRepeat();
      activeKey.pressed = false;
      
      if (currentKey) {
        currentKey.pressed = true;
        activeKey = currentKey;
        draw();
        processKey(currentKey);
        startRepeat(() => processKey(currentKey));
      } else {
        activeKey = null;
        draw();
      }
    }
  }

  function handleEnd(e) {
    e.preventDefault();
    stopRepeat();
    if (activeKey) activeKey.pressed = false;
    activeKey = null;
    draw();
  }

  function processKey(key) {
    // 🔄 Category Navigation Arrows
    if (key.isCatNav) {
      const catIds = Object.keys(emojiCategories);
      const currentIndex = catIds.indexOf(activeEmojiCategory);
      const newIndex = (currentIndex + key.navDir + catIds.length) % catIds.length;
      activeEmojiCategory = catIds[newIndex];
      
      status.textContent = `SYM+SHIFT | ${emojiCategories[activeEmojiCategory].title}`;
      
      buildKeys(); 
      draw(); 
      return;
    }
    
    // 🏷️ Category label is non-interactive
    if (key.isCatLabel) { return; }
    
    // Existing logic for emoji items, nav keys, etc.
    const lbl = key.label;
    if (key.isEmojiItem) { optKb.insertChar(lbl); return; }
    if (key.isNavKey) {
      switch (key.navAction) {
        case 'mode': 
          isSymbols = false; 
          shiftOn = false; 
          activeEmojiCategory = 'faces'; 
          buildKeys();
          break;
        case 'delete': optKb.deleteChar({ direction: 'backward' }); break;
        case 'space': optKb.insertChar(' '); break;
        case 'enter': optKb.insertChar('\n'); break;
      }
      draw(); return;
    }
    if (lbl === '⌨') { optKb.activeTarget?.blur(); return; }
    if (lbl === '⇧') { if (isSymbols) { shiftOn = !shiftOn; if (!shiftOn) activeEmojiCategory = 'faces'; } else shiftOn = !shiftOn; buildKeys(); draw(); return; }
    if (lbl === '⌫') { optKb.deleteChar({ direction: 'backward' }); draw(); return; }
    if (lbl === '⇥') { optKb.insertChar('    '); draw(); return; }
    
    if (lbl === '⏎') { optKb.insertChar('\n'); draw(); return; }
    
    if (lbl === '123') { isSymbols = true; shiftOn = false; buildKeys(); draw(); return; }
    if (lbl === 'ABC') { isSymbols = false; shiftOn = false; buildKeys(); draw(); return; }
    
    let char = lbl;
    if (/[a-z]/i.test(lbl) && !isSymbols) {
      char = shiftOn ? lbl.toUpperCase() : lbl.toLowerCase();
      if (shiftOn) { shiftOn = false; buildKeys(); }
    }
    optKb.insertChar(char);
    draw();
  }

  // Event listeners
  canvas.addEventListener('touchstart', handleStart, { passive: false });
  canvas.addEventListener('touchmove', handleMove, { passive: false });
  canvas.addEventListener('touchend', handleEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleEnd, { passive: false });
  
  let isDown = false;
  canvas.addEventListener('mousedown', e => { isDown = true; handleStart(e); });
  canvas.addEventListener('mousemove', e => { if (isDown) handleMove(e); });
  canvas.addEventListener('mouseup', e => { isDown = false; handleEnd(e); });
  canvas.addEventListener('mouseleave', () => { 
    isDown = false; 
    stopRepeat();
    if (activeKey) activeKey.pressed = false; 
    activeKey = null; 
    draw(); 
  });
}