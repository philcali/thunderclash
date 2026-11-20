/**
 * Input handling — floating virtual sticks (touch) + keyboard/mouse (desktop).
 *
 * Touch (both sticks work simultaneously, multi-touch):
 *   Left half of screen  → movement stick, appears where you touch.
 *   Right half of screen → aim stick, appears where you touch.
 *   Drag either stick to steer; the knob is clamped to the stick radius.
 *   Releasing a stick eases its output back to zero.
 *
 * Desktop:
 *   WASD / arrow keys to move, mouse position to aim.
 *
 * getAimDir() returns {x, y} or null. Null means "no manual aim" —
 * the weapon system then auto-aims at the nearest enemy.
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

class Stick {
  reset() {
    this.active = false;
    this.id = null;
    this.baseX = 0;
    this.baseY = 0;
    this.knobX = 0;
    this.knobY = 0;
    this.dx = 0;       // clamped knob offset from base (CSS px)
    this.dy = 0;
    this.mag = 0;      // 0..1 output magnitude (deadzone applied)
    this.angle = 0;
    this.used = false; // has the player touched this zone at least once
  }

  constructor() { this.reset(); }

  start(id, x, y) {
    this.id = id;
    this.baseX = x;
    this.baseY = y;
    this.knobX = x;
    this.knobY = y;
    this.dx = 0;
    this.dy = 0;
    this.mag = 0;
    this.angle = 0;
    this.active = true;
    this.used = true;
  }
}

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};

    // Movement vector (normalized), updated each frame by updateMoveVector()
    this.moveX = 0;
    this.moveY = 0;

    // Aim output
    this.aimX = 0;
    this.aimY = 0;
    this.aimActive = false;

    // Mouse (desktop)
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseActive = false;

    // Virtual sticks (touch)
    this.stickMove = new Stick();
    this.stickAim = new Stick();

    // Touch bookkeeping (kept for compatibility with renderer HUD code)
    this.touchMoveId = null;
    this.touchAimActive = false;

    this._deadzone = 0.15;    // fraction of stick radius with no output
    this._aimEngage = 0.22;   // fraction of radius required to count as aiming
    this._bindEvents();
  }

  get displayWidth() { return this.canvas.clientWidth || window.innerWidth; }
  get displayHeight() { return this.canvas.clientHeight || window.innerHeight; }

  /** Stick travel radius, scaled to the device (40–64px). */
  stickRadius() {
    const m = Math.min(this.displayWidth, this.displayHeight);
    return clamp(m * 0.17, 40, 64);
  }

  _bindEvents() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse (desktop) — only mouse events activate mouse aiming
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.mouseActive = true;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.mouseActive = true;
    });

    // Suppress long-press context menu (mobile)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch
    const on = (type, fn) =>
      this.canvas.addEventListener(type, (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) fn(t);
      }, { passive: false });

    on('touchstart', (t) => this._handleTouchStart(t));
    on('touchmove', (t) => this._handleTouchMove(t));
    on('touchend', (t) => this._handleTouchEnd(t));
    on('touchcancel', (t) => this._handleTouchEnd(t));
  }

  _handleTouchStart(touch) {
    const half = this.displayWidth / 2;
    if (touch.clientX < half) {
      if (!this.stickMove.active) this.stickMove.start(touch.identifier, touch.clientX, touch.clientY);
    } else {
      if (!this.stickAim.active) this.stickAim.start(touch.identifier, touch.clientX, touch.clientY);
    }
    this._syncCompatFlags();
  }

  _handleTouchMove(touch) {
    const R = this.stickRadius();
    for (const stick of [this.stickMove, this.stickAim]) {
      if (!stick.active || stick.id !== touch.identifier) continue;

      let dx = touch.clientX - stick.baseX;
      let dy = touch.clientY - stick.baseY;
      let mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > R) {
        dx = (dx / mag) * R;
        dy = (dy / mag) * R;
        mag = R;
      }
      stick.knobX = stick.baseX + dx;
      stick.knobY = stick.baseY + dy;
      stick.dx = dx;
      stick.dy = dy;
      if (mag > 0.0001) stick.angle = Math.atan2(dy, dx);

      // Deadzone, then near-linear response
      const norm = mag / R;
      const dz = this._deadzone;
      stick.mag = norm <= dz ? 0 : (norm - dz) / (1 - dz);
    }
    this._syncCompatFlags();
  }

  _handleTouchEnd(touch) {
    for (const stick of [this.stickMove, this.stickAim]) {
      if (stick.active && stick.id === touch.identifier) stick.reset();
    }
    this._syncCompatFlags();
  }

  _syncCompatFlags() {
    this.touchMoveId = this.stickMove.active ? this.stickMove.id : null;
    this.touchAimActive = this.stickAim.active;
  }

  /** Clear all touch state (called on state transitions). */
  resetTouchSticks() {
    this.stickMove.reset();
    this.stickAim.reset();
    this.moveX = 0;
    this.moveY = 0;
    this._syncCompatFlags();
  }

  /** Get aim direction in world space, or null when no manual aim is active. */
  getAimDir() {
    // Touch aim takes priority (hybrid devices)
    if (this.stickAim.active && this.stickAim.mag > this._aimEngage) {
      this.aimActive = true;
      this.aimX = Math.cos(this.stickAim.angle);
      this.aimY = Math.sin(this.stickAim.angle);
      return { x: this.aimX, y: this.aimY };
    }

    if (this.mouseActive) {
      const dx = this.mouseX - this.displayWidth / 2;
      const dy = this.mouseY - this.displayHeight / 2;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 4) {
        this.aimActive = true;
        this.aimX = dx / len;
        this.aimY = dy / len;
        return { x: this.aimX, y: this.aimY };
      }
    }

    this.aimActive = false;
    this.aimX = 0;
    this.aimY = 0;
    return null;
  }

  /** Backwards-compatible alias. */
  getAimDirection() {
    return this.getAimDir();
  }

  /** Update movement vector from keyboard + movement stick. Call each frame. */
  updateMoveVector() {
    let kx = 0, ky = 0;
    if (this.keys['w'] || this.keys['arrowup']) ky -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) ky += 1;
    if (this.keys['a'] || this.keys['arrowleft']) kx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) kx += 1;
    const klen = Math.sqrt(kx * kx + ky * ky);
    if (klen > 1) { kx /= klen; ky /= klen; }

    let sx = 0, sy = 0;
    if (this.stickMove.active) {
      sx = Math.cos(this.stickMove.angle) * this.stickMove.mag;
      sy = Math.sin(this.stickMove.angle) * this.stickMove.mag;
    }

    let dx = kx + sx;
    let dy = ky + sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.moveX = dx;
    this.moveY = dy;
  }
}

export default Input;
