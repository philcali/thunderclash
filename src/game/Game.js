/**
 * Game — central orchestrator: game loop, state machine, subsystem wiring.
 */
import Input from './Input.js';
import Camera from './Camera.js';
import GameState from './GameState.js';
import Renderer from './Renderer.js';
import { GODS } from '../data/gods.js';

/**
 * Read the OS safe-area insets (notch / home indicator) in CSS px.
 * Works because `env(safe-area-inset-*)` resolves against a real element
 * when the viewport meta includes `viewport-fit=cover`.
 */
function readSafeInsets() {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);';
  document.body.appendChild(probe);
  const cs = window.getComputedStyle(probe);
  const insets = {
    top: Math.max(0, parseFloat(cs.paddingTop) || 0),
    right: Math.max(0, parseFloat(cs.paddingRight) || 0),
    bottom: Math.max(0, parseFloat(cs.paddingBottom) || 0),
    left: Math.max(0, parseFloat(cs.paddingLeft) || 0),
  };
  probe.remove();
  return insets;
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.renderer = new Renderer(canvas);

    this.input = new Input(canvas);
    this.camera = new Camera();
    this.stateMachine = new GameState(this);

    // God selection
    this.gods = GODS;
    const unlocked = JSON.parse(localStorage.getItem('thunderclash_unlocked') || '["zeus"]');
    this.availableGods = this.gods.filter(g => unlocked.includes(g.id));
    this.selectedGodIndex = 0;

    // Game loop state
    this.lastTime = 0;
    this.accumulator = 0;
    this.tickRate = 1000 / 60; // 60 Hz simulation

    // Mobile
    this.safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.hintTimer = 0; // seconds of on-screen control hints left

    // Subsystems (populated during PlayingState.enter)
    this.player = null;
    this.entityManager = null;
    this.weaponSystem = null;
    this.waveSystem = null;
    this.score = null;
    this.upgradeSystem = null;
  }

  async start() {
    this.safeInsets = readSafeInsets();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.stateMachine.enter('menu');
    requestAnimationFrame((ts) => this._loop(ts));
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap DPR at 2.5 — crisp on retina phones without overfilling the GPU.
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // All game code draws in CSS pixels; the base transform applies DPR.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const delta = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.accumulator += Math.min(delta, 100); // clamp to avoid spiral

    while (this.accumulator >= this.tickRate) {
      this.stateMachine.update(this.tickRate / 1000);
      this.accumulator -= this.tickRate;
    }

    requestAnimationFrame((ts) => this._loop(ts));
  }
}

export default Game;
