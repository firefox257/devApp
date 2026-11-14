/**
 * vrCom — Virtual Reality Mobile Canvas Controller Module
 * Meta Quest-style layout for portrait mobile screens.
 * Joysticks centered between face buttons and vertically aligned with button centers.
 * Button horizontal spacing improved for better left-to-right distribution.
 * Height slider moved up so it does NOT overlap the RT button.
 * Swipe gesture added to rotate POV left/right (combined with sensor offset).
 */

const DEFAULTS = {
  deadzone: 0.05,
  stickMaxRadius: 45,
  stickDeadzone: 0.08,
  sliderWidth: 44,
  sliderMargin: 16,
  buttonRadius: 22,
  emitRate: 1 / 60,
  useSensors: true,
  useCompass: true,
  showOverlay: true,
  overlayOpacity: 0.6,
  leftRegion: 0.50,
  rightRegion: 0.50
};

const BUTTON_LAYOUT = {
  // ---- Left side grips & triggers ----
  lTrig: { x: 0.06, y: 0.68, label: 'LT', shape: 'pill-h', side: 'left',  key: 'trigger' },
  lGrip: { x: 0.06, y: 0.80, label: 'LG', shape: 'pill-v', side: 'left',  key: 'grip' },
  
  // ---- Left face buttons ----
  y:     { x: 0.21, y: 0.72, label: 'Y', shape: 'circle', side: 'left',  key: 'y' },
  x:     { x: 0.21, y: 0.84, label: 'X', shape: 'circle', side: 'left',  key: 'x' },
  
  // ---- Right face buttons ----
  b:     { x: 0.79, y: 0.72, label: 'B', shape: 'circle', side: 'right', key: 'b' },
  a:     { x: 0.79, y: 0.84, label: 'A', shape: 'circle', side: 'right', key: 'a' },
  
  // ---- Right side grips & triggers ----
  rTrig: { x: 0.94, y: 0.68, label: 'RT', shape: 'pill-h', side: 'right', key: 'trigger' },
  rGrip: { x: 0.94, y: 0.80, label: 'RG', shape: 'pill-v', side: 'right', key: 'grip' },
  
  // ---- Menu buttons ----
  menu:  { x: 0.42, y: 0.96, label: '☰', shape: 'small', side: 'left',  key: 'menu' },
  menuR: { x: 0.58, y: 0.96, label: '◫', shape: 'small', side: 'right', key: 'menuR' }
};

const STICK_HOME = {
  left:  { x: 0.38, y: 0.78 },
  right: { x: 0.62, y: 0.78 }
};

// Slider moved up — bottom at 0.58, RT button at 0.68 = 10% screen gap (no overlap)
const SLIDER_RANGE = { yTop: 0.38, yBottom: 0.58 };

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function applyDeadzone(v, dz) { return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

export class VRCom extends EventTarget {
  constructor(canvas, options = {}) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = { ...DEFAULTS, ...options };

    this.state = {
      timestamp: 0,
      headset: {
        orientation: { pitch: 0, yaw: 0, roll: 0 },
        quaternion: [0, 0, 0, 1],
        squatScalar: 0.75
      },
      controllers: {
        left:  { joystick: { x: 0, y: 0 }, trigger: 0, grip: 0, buttons: { x: false, y: false, menu: false } },
        right: { joystick: { x: 0, y: 0 }, trigger: 0, grip: 0, buttons: { a: false, b: false, menuR: false } }
      }
    };

    this.leftStick  = { active: false, touchId: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.rightStick = { active: false, touchId: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.slider     = { touchId: null, value: 0.75 };
    this.buttons    = {};
    for (const k in BUTTON_LAYOUT) this.buttons[k] = { pressed: false, touchId: null };
    
    // Track active swipe touches and manual rotation offset
    this.swipes = {};
    this.manualYawOffset = 0;

    this._sensorReady = false;
    this._mouseDown = false;
    this._orientationHandler = this._onOrientation.bind(this);
    this._resizeHandler = () => this._resize();

    this._running = false;
    this._lastEmit = 0;
    this._rafId = null;
    this._loop = this._loop.bind(this);

    this._resize();
    this._bindInput();
  }

  async start() {
    if (this._running) return;
    await this._requestSensorPermission();
    window.addEventListener('deviceorientation', this._orientationHandler, true);
    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('orientationchange', this._resizeHandler);
    this._running = true;
    this._lastEmit = performance.now() / 1000;
    this._rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('deviceorientation', this._orientationHandler, true);
    window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('orientationchange', this._resizeHandler);
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  async _requestSensorPermission() {
    if (!this.options.useSensors) return;

    // If village.html already handled the iOS prompt inside the click gesture,
    // do not request again here, because this later call may not have a gesture.
    if (window._vrComPermissionHandled) {
      this._sensorReady = window._vrComPermissionGranted === true;
      return;
    }

    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const r = await DOE.requestPermission();
        if (r !== 'granted') console.warn('[vrCom] orientation permission denied');
      } catch (e) {
        console.warn('[vrCom] permission error', e);
      }
    }

    this._sensorReady = true;
  }

  _onOrientation(e) {
    if (!this.options.useSensors) return;
    
    let yawDeg = 0;
    
    // FIX: Ensure iOS compass is calibrated and not returning NaN
    const hasIosCompass = this.options.useCompass && 
                          typeof e.webkitCompassHeading === 'number' && 
                          !isNaN(e.webkitCompassHeading) && 
                          e.webkitCompassAccuracy !== -1;

    if (hasIosCompass) {
      yawDeg = e.webkitCompassHeading;
    } else if (e.alpha != null && !isNaN(e.alpha)) {
      yawDeg = (360 - e.alpha) % 360;
    }
    
    const pitchDeg = (e.beta || 0) - 90;
    const rollDeg = e.gamma || 0;

    const pitch = pitchDeg * Math.PI / 180;
    const yaw   = yawDeg   * Math.PI / 180;
    const roll  = rollDeg  * Math.PI / 180;

    // Apply manual swipe offset to the sensor yaw so they don't fight
    this.state.headset.orientation.pitch = pitch;
    this.state.headset.orientation.yaw   = yaw + this.manualYawOffset;
    this.state.headset.orientation.roll  = roll;
    this._eulerToQuat(this.state.headset.orientation.yaw, pitch, roll);
  }

  _eulerToQuat(y, p, r) {
    const c1 = Math.cos(y/2), s1 = Math.sin(y/2);
    const c2 = Math.cos(p/2), s2 = Math.sin(p/2);
    const c3 = Math.cos(r/2), s3 = Math.sin(r/2);
    this.state.headset.quaternion = [
      s1*c2*c3 - c1*s2*s3,
      c1*s2*c3 + s1*c2*s3,
      c1*c2*s3 - s1*s2*c3,
      c1*c2*c3 + s1*s2*s3
    ];
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
  }

  _bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('touchstart',  this._onTStart.bind(this), { passive: false });
    c.addEventListener('touchmove',   this._onTMove.bind(this),  { passive: false });
    c.addEventListener('touchend',    this._onTEnd.bind(this),   { passive: false });
    c.addEventListener('touchcancel', this._onTEnd.bind(this),   { passive: false });

    c.addEventListener('mousedown', e => this._onTStart({ identifier: -1, clientX: e.clientX, clientY: e.clientY }));
    c.addEventListener('mousemove', e => { if (this._mouseDown) this._onTMove({ identifier: -1, clientX: e.clientX, clientY: e.clientY }); });
    c.addEventListener('mouseup',   () => { this._mouseDown = false; this._onTEnd({ identifier: -1 }); });
  }

  _onTStart(e) {
    if (e.preventDefault) e.preventDefault();
    const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
    for (const t of list) {
      if (t.identifier === -1) this._mouseDown = true;
      this._touchBegin(t.identifier, t.clientX, t.clientY);
    }
  }
  
  _onTMove(e) {
    if (e.preventDefault) e.preventDefault();
    const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
    for (const t of list) this._touchMove(t.identifier, t.clientX, t.clientY);
  }
  
  _onTEnd(e) {
    if (e.preventDefault) e.preventDefault();
    const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
    for (const t of list) this._touchEnd(t.identifier);
  }

  _hitTestSlider(x, y) {
    const sliderX = this.width - 22;
    const sTop = SLIDER_RANGE.yTop * this.height;
    const sBot = SLIDER_RANGE.yBottom * this.height;
    return Math.abs(x - sliderX) < this.options.sliderWidth && y >= sTop - 10 && y <= sBot + 10;
  }

  _hitTestButton(x, y, key) {
    const b = BUTTON_LAYOUT[key];
    const bx = b.x * this.width, by = b.y * this.height;
    if (b.shape === 'pill-v') {
      return Math.abs(x - bx) < 22 && Math.abs(y - by) < 40;
    } else if (b.shape === 'pill-h') {
      return Math.abs(x - bx) < 40 && Math.abs(y - by) < 22;
    } else if (b.shape === 'small') {
      return dist2(x, y, bx, by) < (this.options.buttonRadius * 0.7 + 12) ** 2;
    } else {
      return dist2(x, y, bx, by) < (this.options.buttonRadius + 14) ** 2;
    }
  }

  _touchBegin(id, x, y) {
    // Priority order: slider > buttons > sticks
    if (this._hitTestSlider(x, y)) {
      this.slider.touchId = id;
      this._updateSlider(y);
      return;
    }
    
    for (const key in BUTTON_LAYOUT) {
      if (this._hitTestButton(x, y, key)) {
        this.buttons[key].pressed = true;
        this.buttons[key].touchId = id;
        this._syncButtons();
        return;
      }
    }
    
    const yRatio = y / this.height;
    if (x < this.width * this.options.leftRegion && yRatio > 0.70 && !this.leftStick.active) {
      this.leftStick.active = true;
      this.leftStick.touchId = id;
      this.leftStick.cx = x; this.leftStick.cy = y;
      this.leftStick.x = 0; this.leftStick.y = 0;
      return;
    } else if (x >= this.width * (1 - this.options.rightRegion) && yRatio > 0.70 && !this.rightStick.active) {
      this.rightStick.active = true;
      this.rightStick.touchId = id;
      this.rightStick.cx = x; this.rightStick.cy = y;
      this.rightStick.x = 0; this.rightStick.y = 0;
      return;
    }

    // If it didn't hit any UI element, it's a swipe
    if (Object.keys(this.swipes).length === 0) {
      this.swipes[id] = { currentX: x, currentY: y };
    }
  }

  _touchMove(id, x, y) {
    if (this.slider.touchId === id) { this._updateSlider(y); return; }
    for (const key in BUTTON_LAYOUT) {
      const btn = this.buttons[key];
      if (btn.touchId === id) {
        const pressed = this._hitTestButton(x, y, key);
        if (btn.pressed !== pressed) { btn.pressed = pressed; this._syncButtons(); }
        return;
      }
    }
    if (this.leftStick.touchId === id)  this._updateStick(this.leftStick,  x, y, 'left');
    if (this.rightStick.touchId === id) this._updateStick(this.rightStick, x, y, 'right');
    
    // Handle swipe rotation
    if (this.swipes[id]) {
      const swipe = this.swipes[id];
      const dx = x - swipe.currentX;
      
      // Sensitivity: 360 degrees (2*PI radians) per full screen width swipe
      const sensitivity = (Math.PI * 2) / this.width;
      this.manualYawOffset += dx * sensitivity;
      
      swipe.currentX = x;
      swipe.currentY = y;
      return;
    }
  }

  _touchEnd(id) {
    if (this.slider.touchId === id) this.slider.touchId = null;
    for (const key in this.buttons) {
      if (this.buttons[key].touchId === id) {
        this.buttons[key].pressed = false;
        this.buttons[key].touchId = null;
        this._syncButtons();
      }
    }
    if (this.leftStick.touchId === id) {
      this.leftStick.active = false; this.leftStick.touchId = null;
      this.leftStick.x = 0; this.leftStick.y = 0;
      this.state.controllers.left.joystick.x = 0;
      this.state.controllers.left.joystick.y = 0;
    }
    if (this.rightStick.touchId === id) {
      this.rightStick.active = false; this.rightStick.touchId = null;
      this.rightStick.x = 0; this.rightStick.y = 0;
      this.state.controllers.right.joystick.x = 0;
      this.state.controllers.right.joystick.y = 0;
    }
    if (this.swipes[id]) {
      delete this.swipes[id];
    }
  }

  _updateStick(stick, x, y, side) {
    let dx = x - stick.cx;
    let dy = y - stick.cy;
    const d = Math.hypot(dx, dy);
    const max = this.options.stickMaxRadius;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    stick.x = dx / max;
    stick.y = dy / max;
    const jx = applyDeadzone(stick.x, this.options.stickDeadzone);
    const jy = applyDeadzone(stick.y, this.options.stickDeadzone);
    this.state.controllers[side].joystick.x = clamp(jx, -1, 1);
    this.state.controllers[side].joystick.y = clamp(-jy, -1, 1);
  }

  _updateSlider(y) {
    const sTop = SLIDER_RANGE.yTop * this.height;
    const sBot = SLIDER_RANGE.yBottom * this.height;
    const t = clamp((y - sTop) / (sBot - sTop), 0, 1);
    this.slider.value = 1 - t;
    this.state.headset.squatScalar = this.slider.value;
  }

  _syncButtons() {
    const L = this.state.controllers.left;
    const R = this.state.controllers.right;
    L.buttons.menu = this.buttons.menu.pressed;
    L.buttons.y    = this.buttons.y.pressed;
    L.buttons.x    = this.buttons.x.pressed;
    R.buttons.a    = this.buttons.a.pressed;
    R.buttons.b    = this.buttons.b.pressed;
    R.buttons.menuR = this.buttons.menuR.pressed;
    L.trigger = this.buttons.lTrig.pressed ? 1 : 0;
    L.grip    = this.buttons.lGrip.pressed ? 1 : 0;
    R.trigger = this.buttons.rTrig.pressed ? 1 : 0;
    R.grip    = this.buttons.rGrip.pressed ? 1 : 0;
  }

  _loop(nowMs) {
    if (!this._running) return;
    const now = nowMs / 1000;
    this.state.timestamp = nowMs;

    if (this.options.showOverlay) this._drawOverlay();

    if (now - this._lastEmit >= this.options.emitRate) {
      this._lastEmit = now;
      this.dispatchEvent(new CustomEvent('input', { detail: this.getState() }));
    }
    this._rafId = requestAnimationFrame(this._loop);
  }

  _drawOverlay() {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = this.options.overlayOpacity;

    this._drawStickHome(ctx, STICK_HOME.left);
    this._drawStickHome(ctx, STICK_HOME.right);

    this._drawStick(ctx, this.leftStick);
    this._drawStick(ctx, this.rightStick);

    ctx.globalAlpha = this.options.overlayOpacity * 0.95;
    for (const key in BUTTON_LAYOUT) {
      this._drawButton(ctx, key);
    }

    ctx.globalAlpha = this.options.overlayOpacity;
    const sx = w - 22;
    const sTop = SLIDER_RANGE.yTop * h;
    const sBot = SLIDER_RANGE.yBottom * h;
    ctx.fillStyle = 'rgba(20,20,30,0.5)';
    ctx.fillRect(sx - 8, sTop, 16, sBot - sTop);
    const knobY = sTop + (1 - this.slider.value) * (sBot - sTop);
    ctx.beginPath();
    ctx.arc(sx, knobY, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,200,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('HEIGHT', sx, sTop - 10);

    ctx.globalAlpha = 1;
  }

  _drawStickHome(ctx, home) {
    const r = this.options.stickMaxRadius;
    const cx = home.x * this.width;
    const cy = home.y * this.height;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,30,50,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawStick(ctx, stick) {
    if (!stick.active) return;
    const r = this.options.stickMaxRadius;
    ctx.beginPath();
    ctx.arc(stick.cx, stick.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,20,30,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.cx + stick.x * r, stick.cy + stick.y * r, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,220,255,0.9)';
    ctx.fill();
  }

  _drawButton(ctx, key) {
    const b = BUTTON_LAYOUT[key];
    const bx = b.x * this.width, by = b.y * this.height;
    const pressed = this.buttons[key].pressed;
    const fillColor = pressed ? 'rgba(255,200,80,0.9)' : 'rgba(30,30,40,0.7)';
    const strokeColor = pressed ? 'rgba(255,240,180,1)' : 'rgba(255,255,255,0.75)';

    ctx.save();
    ctx.globalAlpha = this.options.overlayOpacity * 0.95;

    if (b.shape === 'pill-v') {
      const pw = 36, ph = 70, pr = 18;
      this._roundRect(ctx, bx - pw/2, by - ph/2, pw, ph, pr);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (b.shape === 'pill-h') {
      const pw = 70, ph = 36, pr = 18;
      this._roundRect(ctx, bx - pw/2, by - ph/2, pw, ph, pr);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (b.shape === 'small') {
      const r = this.options.buttonRadius * 0.7;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(bx, by, this.options.buttonRadius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = pressed ? '#2a1a00' : '#fff';
    ctx.font = `bold ${b.shape === 'small' ? 16 : 18}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, bx, by);

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export default VRCom;