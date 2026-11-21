/**
 * GameState — state machine for menu, playing, upgrade-select, game-over.
 */
import { WEAPONS } from '../data/weapons.js';
import { GODS } from '../data/gods.js';
import { ABILITIES } from '../data/abilities.js';
import EntityManager from '../systems/EntityManager.js';
import Camera from './Camera.js';
import WeaponSystem from '../systems/WeaponSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import WaveSystem from '../systems/WaveSystem.js';
import ScoreSystem from '../systems/ScoreSystem.js';
import UpgradeSystem from '../systems/UpgradeSystem.js';
import CollisionSystem from '../systems/CollisionSystem.js';
import Player from '../entities/Player.js';
import Haptics from './Haptics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CAN_TOUCH = typeof window !== 'undefined' && typeof navigator !== 'undefined' &&
  ((navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window);

// ── State machine ────────────────────────────────────────────────

class GameState {
  constructor(game) {
    this.game = game;
    this.states = {
      menu: new MenuState(game),
      playing: new PlayingState(game),
      upgradeSelect: new UpgradeSelectState(game),
      gameOver: new GameOverState(game),
    };
    this.current = null;
    this.name = null;
  }

  enter(stateName) {
    if (this.current) this.current.exit();
    this.current = this.states[stateName];
    this.name = stateName;
    this.current.enter();
    // Release any lingering touch state between screens.
    this.game.input.resetTouchSticks();
  }

  update(dt) {
    if (this.current) this.current.update(dt);
  }
}

// ── Menu state ───────────────────────────────────────────────────

class MenuState {
  constructor(game) {
    this.game = game;
    this.selectedGod = 0;
    const unlocked = JSON.parse(localStorage.getItem('thunderclash_unlocked') || '["zeus"]');
    this.availableGods = GODS.filter(g => unlocked.includes(g.id));
    this._startHandler = null;
    this._tapHandler = null;
    this._lastTouchEnd = 0;
    // Load concept art portraits
    this.portraitImages = {};
    this._portraitReady = false;
    this._portraitPaths = {
      zeus: './assets/zeus_manga.png',
      poseidon: './assets/poseidon_manga.png',
      hades: './assets/hades_manga.png',
      athena: './assets/athena_manga.png',
      ares: './assets/ares_manga.png',
    };
    Object.entries(this._portraitPaths).forEach(([id, path]) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.portraitImages[id] = img;
        this._portraitReady = Object.keys(this.portraitImages).length === Object.keys(this._portraitPaths).length;
        this._draw();
      };
      img.src = path;
    });
  }

  enter() {
    const canvas = this.game.renderer.canvas;

    // Tap/click: nav arrows cycle gods, anything else starts the game.
    const tap = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const L = this._layout();

      if (this.availableGods.length > 1) {
        if (this._inRect(x, y, L.navLeft)) { this._cycleGod(-1); return; }
        if (this._inRect(x, y, L.navRight)) { this._cycleGod(1); return; }
      }
      this._beginGame();
    };

    const touchHandler = (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      this._lastTouchEnd = performance.now();
      tap(t.clientX, t.clientY);
    };
    const clickHandler = (e) => {
      // Ignore synthetic clicks that follow a touchend
      if (performance.now() - this._lastTouchEnd < 700) return;
      tap(e.clientX, e.clientY);
    };

    canvas.addEventListener('touchend', touchHandler, { passive: true });
    canvas.addEventListener('click', clickHandler);
    this._startHandler = clickHandler;
    this._tapHandler = touchHandler;

    this._draw();
  }

  exit() {
    const canvas = this.game.renderer.canvas;
    if (this._startHandler) canvas.removeEventListener('click', this._startHandler);
    if (this._tapHandler) canvas.removeEventListener('touchend', this._tapHandler);
    this._startHandler = null;
    this._tapHandler = null;
  }

  _inRect(x, y, r) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  _cycleGod(dir) {
    const n = this.availableGods.length;
    if (n < 2) return;
    this.selectedGod = (this.selectedGod + dir + n) % n;
    Haptics.tap();
  }

  _beginGame() {
    const selectedGod = this.availableGods[this.selectedGod];
    this.game.selectedGodIndex = this.game.gods.findIndex(g => g.id === selectedGod.id);
    Haptics.tap();
    this.game.stateMachine.enter('playing');
  }

  update(dt) {
    // Keyboard god selection
    const input = this.game.input;
    if (this.availableGods.length > 1) {
      if (input.keys['arrowleft'] || input.keys['a']) {
        this._cycleGod(-1);
        input.keys['arrowleft'] = false;
        input.keys['a'] = false;
      }
      if (input.keys['arrowright'] || input.keys['d']) {
        this._cycleGod(1);
        input.keys['arrowright'] = false;
        input.keys['d'] = false;
      }
    }
    if (input.keys[' '] || input.keys['enter'] || input.keys['escape']) {
      input.keys[' '] = false;
      input.keys['enter'] = false;
      input.keys['escape'] = false;
      this._beginGame();
      return;
    }
    this._draw();
  }

  /** Responsive menu layout (CSS px). */
  _layout() {
    const w = this.game.renderer.displayWidth;
    const h = this.game.renderer.displayHeight;
    const safe = this.game.safeInsets || { top: 0, bottom: 0 };
    const s = clamp(Math.min(w / 700, h / 820), 0.55, 1);

    const portraitW = Math.min(340, w * 0.75);
    const portraitH = portraitW * (1024 / 768); // maintain 768x1024 aspect
    const portraitX = w / 2 - portraitW / 2;
    const portraitY = Math.max(safe.top + 120 * s, h * 0.18);
    const infoY = portraitY + portraitH + 20 * s;
    const nav = clamp(portraitW * 0.22, 44, 64);
    const navY = portraitY + portraitH / 2 - nav / 2;

    return {
      w, h, s,
      titleY: Math.max(safe.top + 40 * s, h * 0.08),
      portraitW, portraitH, portraitX, portraitY,
      infoY,
      navLeft: { x: portraitX - nav - 20, y: navY, w: nav, h: nav },
      navRight: { x: portraitX + portraitW + 20, y: navY, w: nav, h: nav },
      promptY: h - (safe.bottom + 44),
    };
  }

  _draw() {
    const ctx = this.game.renderer.ctx;
    const L = this._layout();
    const { w, h, s } = L;

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const multiGod = this.availableGods.length > 1;
    const god = this.availableGods[this.selectedGod];

    // Title (scaled to fit narrow screens)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    let titleSize = 44 * s;
    ctx.font = `bold ${Math.round(titleSize)}px monospace`;
    while (ctx.measureText('THUNDERCLASH').width > w * 0.9 && titleSize > 16) {
      titleSize -= 1;
      ctx.font = `bold ${Math.round(titleSize)}px monospace`;
    }
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
    ctx.fillText('THUNDERCLASH', w / 2, L.titleY);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#9370db';
    ctx.font = `${Math.round(15 * s)}px monospace`;
    ctx.fillText('Olympus vs the Underworld', w / 2, L.titleY + 28 * s);

    // God portrait — image or fallback emoji card
    const { portraitW, portraitH, portraitX, portraitY } = L;
    const img = this.portraitImages[god.id];
    if (img && img.complete && img.naturalWidth > 0) {
      // Draw portrait with subtle glow border matching god color
      ctx.save();
      ctx.shadowColor = god.color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = god.color + '66';
      ctx.lineWidth = 2;
      ctx.strokeRect(portraitX, portraitY, portraitW, portraitH);
      ctx.restore();
      // Draw the image inside the border (clip to rect with slight rounding)
      ctx.save();
      ctx.beginPath();
      ctx.rect(portraitX + 2, portraitY + 2, portraitW - 4, portraitH - 4);
      ctx.clip();
      ctx.drawImage(img, portraitX, portraitY, portraitW, portraitH);
      ctx.restore();
    } else {
      // Fallback: colored card with emoji
      const cardW = portraitW;
      const cardH = portraitH;
      ctx.fillStyle = god.color + '22';
      ctx.strokeStyle = god.color + '88';
      ctx.lineWidth = 2;
      ctx.fillRect(portraitX, portraitY, cardW, cardH);
      ctx.strokeRect(portraitX, portraitY, cardW, cardH);
      ctx.save();
      ctx.shadowColor = god.color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = god.color;
      ctx.font = `${Math.round(cardH * 0.32)}px serif`;
      ctx.fillText(god.icon, portraitX + cardW / 2, portraitY + cardH * 0.38);
      ctx.restore();
    }

    // God name
    ctx.fillStyle = god.color;
    ctx.font = `bold ${Math.round(19 * s)}px monospace`;
    ctx.fillText(god.name, w / 2, L.infoY);

    // God description (wrapped)
    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.round(12 * s)}px monospace`;
    const descLines = this._wrapText(ctx, god.description, portraitW - 16);
    descLines.forEach((line, i) => {
      ctx.fillText(line, w / 2, L.infoY + 22 * s + i * 16 * s);
    });

    // God weapon
    const weapon = WEAPONS[god.weapon];
    ctx.fillStyle = '#888';
    ctx.font = `${Math.round(11 * s)}px monospace`;
    ctx.fillText(`Weapon: ${weapon.name}`, w / 2, L.infoY + 22 * s + descLines.length * 16 * s);

    // God ability (the secondary move)
    const ability = ABILITIES[god.id];
    if (ability) {
      ctx.fillStyle = ability.color;
      ctx.font = `bold ${Math.round(12 * s)}px monospace`;
      ctx.fillText(`${ability.icon} ${ability.name} — ${ability.tagline}`, w / 2, L.infoY + 22 * s + (descLines.length + 1) * 16 * s);
    }

    // Nav arrows (large touch targets)
    if (multiGod) {
      ctx.fillStyle = '#888';
      ctx.font = `${Math.round(22 * s)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◄', L.navLeft.x + L.navLeft.w / 2, L.navLeft.y + L.navLeft.h / 2);
      ctx.fillText('►', L.navRight.x + L.navRight.w / 2, L.navRight.y + L.navRight.h / 2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
    }

    // Start prompt
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.4 + pulse * 0.6})`;
    ctx.font = `bold ${Math.round(16 * s)}px monospace`;
    const prompt = CAN_TOUCH ? 'TAP TO BEGIN' : 'PRESS SPACE TO BEGIN';
    ctx.fillText(prompt, w / 2, L.promptY);

    ctx.textAlign = 'left';
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}

// ── Playing state ────────────────────────────────────────────────

class PlayingState {
  constructor(game) {
    this.game = game;
  }

  enter() {
    // Only initialize on first enter (actual game start).
    // On subsequent enters (returning from upgrade selection), the player
    // and subsystems already exist with upgrades/stats intact.
    if (!this.game.player) {
      // Reset game state
      const god = this.game.gods[this.game.selectedGodIndex];
      this.game.player = new Player(god);
      this.game.player.weaponStats = { ...WEAPONS[god.weapon] };

      this.game.entityManager = new EntityManager();
      this.game.camera = new Camera();
      this.game.weaponSystem = new WeaponSystem(this.game.player, this.game.entityManager);
      this.game.abilitySystem = new AbilitySystem(this.game);
      this.game.waveSystem = new WaveSystem(this.game.entityManager, this.game);
      this.game.score = new ScoreSystem();
      this.game.upgradeSystem = new UpgradeSystem();
      this.game.selectedGodIndex = this.game.selectedGodIndex;

      // Handle pending god switch (from blessing selection)
      if (this.game.player.pendingGodSwitch) {
        this.game.player.god = this.game.player.pendingGodSwitch;
        this.game.player.weaponStats = { ...WEAPONS[this.game.player.god.weapon] };
        this.game.player.pendingGodSwitch = null;
      }

      // First-run control hints (mobile)
      this.game.hintTimer = 10;
      this.game.input.resetTouchSticks();
    }

    // Start the next wave whenever we return to playing (game start or
    // after upgrade selection).
    if (this.game.waveSystem) {
      this.game.waveSystem.betweenWaves = false;
      this.game.waveSystem.startWave();
    }
  }

  update(dt) {
    const { player, input, camera, entityManager, weaponSystem, waveSystem, score, renderer } = this.game;

    // Control-hint countdown
    if (this.game.hintTimer > 0) {
      this.game.hintTimer -= dt;
      if (input.stickMove.used && input.stickAim.used) this.game.hintTimer = 0;
    }

    // (abilitySystem comes from the game object; destructured above)
    const abilitySystem = this.game.abilitySystem;

    // Update movement
    input.updateMoveVector();
    let dx = input.moveX;
    let dy = input.moveY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len; dy /= len;
    }
    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;

    // Update camera
    camera.update(dt, player);

    // Update player timers (invincibility, shield, health regen)
    player.update(dt);

    // Update entities
    entityManager.update(dt);

    // Aim: null means "no manual aim" — WeaponSystem auto-aims instead.
    const aimDir = input.getAimDir();

    // Update weapon system
    weaponSystem.update(dt, aimDir);

    // Ability: tick cooldown/pending effects, then fire on a fresh press
    if (abilitySystem) {
      abilitySystem.update(dt);
      if (input.consumeAbilityPress()) abilitySystem.tryActivate();
    }

    // Update wave system
    waveSystem.update(dt);

    // If the wave ended and the state machine switched to upgradeSelect,
    // stop updating the playing scene — the upgrade screen was already
    // drawn on this frame and renderer.render() would overwrite it.
    if (this.game.stateMachine.name !== 'playing') return;

    // Update score
    score.update(dt);

    // Resolve collisions
    const projectiles = entityManager.getByType('projectile');
    const enemies = entityManager.getByType('enemy');
    const particles = entityManager.getByType('particle');
    const dead = CollisionSystem.resolve(
      projectiles, enemies, player, entityManager
    );

    // Clean up dead projectiles and track kills
    for (const proj of dead.projectiles) {
      entityManager.remove(proj.id);
    }
    for (const enemy of dead.enemies) {
      waveSystem.onEnemyKilled(enemy);
    }

    // Check game over
    if (player.health <= 0) {
      this.game.stateMachine.enter('gameOver');
    }

    // No between-waves logic here — WaveSystem.update() owns the
    // wave delay timer and the upgrade screen transition.

    // Render
    renderer.render(this.game);
  }

  exit() {}
}

// ── Upgrade select state ─────────────────────────────────────────

class UpgradeSelectState {
  constructor(game) {
    this.game = game;
    this.options = [];
    this.hoveredIdx = -1;
    this.pulsePhase = 0;
    this.touchHandler = null;
    this.mouseHandler = null;
    this._lastTouchEnd = 0;
    // Load blessing icons
    this.iconImages = {};
    this._iconsReady = false;
    this._iconPaths = {
      zeus_fury: './assets/icons/zeus_fury.png',
      poseidon_tide: './assets/icons/poseidon_tide.png',
      apollo_light: './assets/icons/apollo_light.png',
      hermes_swiftness: './assets/icons/hermes_swiftness.png',
      athena_wisdom: './assets/icons/athena_wisdom.png',
      ares_rage: './assets/icons/ares_rage.png',
      artemis_haste: './assets/icons/artemis_haste.png',
      hephaestus_forge: './assets/icons/hephaestus_forge.png',
      demeter_bounty: './assets/icons/demeter_bounty.png',
      new_god: './assets/icons/new_god.png',
    };
    Object.entries(this._iconPaths).forEach(([id, path]) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.iconImages[id] = img;
        this._iconsReady = Object.keys(this.iconImages).length === Object.keys(this._iconPaths).length;
        this._draw();
      };
      img.src = path;
    });
  }

  enter() {
    this.options = this.game.upgradeSystem.generateOptions(
      this.game.player,
      this.game.upgradeSystem.selectedUpgrades.map(u => u.id)
    );
    this.hoveredIdx = -1;
    this.pulsePhase = 0;

    const canvas = this.game.renderer.canvas;
    const handler = (e) => {
      e.preventDefault();
      let clientX, clientY;
      if (e.changedTouches) {
        const t = e.changedTouches[0];
        if (!t) return;
        this._lastTouchEnd = performance.now();
        clientX = t.clientX;
        clientY = t.clientY;
      } else {
        if (performance.now() - this._lastTouchEnd < 700) return;
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const L = this._layout();

      for (let i = 0; i < this.options.length; i++) {
        const c = L.cards[i];
        if (x >= c.x && x <= c.x + L.cardW && y >= c.y && y <= c.y + L.cardH) {
          this._select(i);
          return;
        }
      }
    };
    this.touchHandler = handler;
    this.mouseHandler = handler;
    canvas.addEventListener('touchstart', this.touchHandler, { passive: false });
    canvas.addEventListener('mousedown', this.mouseHandler);

    this._draw();
  }

  _select(idx) {
    const upgrade = this.options[idx];
    this.game.upgradeSystem.selectUpgrade(upgrade.id, this.game.player);
    Haptics.tap();
    // Reset wave system so the next wave starts and the grace
    // period timer resets (prevents immediate re-trigger).
    this.game.waveSystem.betweenWaves = false;
    this.game.waveSystem.waveDelay = 3;
    this.game.stateMachine.enter('playing');
  }

  update(dt) {
    this.pulsePhase += dt * 3;

    // Handle input
    const input = this.game.input;

    // Arrow keys to navigate, space to select
    if (input.keys['arrowleft']) {
      this.hoveredIdx = (this.hoveredIdx - 1 + 3) % 3;
      input.keys['arrowleft'] = false;
      this._draw();
    }
    if (input.keys['arrowright']) {
      this.hoveredIdx = (this.hoveredIdx + 1) % 3;
      input.keys['arrowright'] = false;
      this._draw();
    }
    if (input.keys[' '] || input.keys['enter']) {
      if (this.hoveredIdx >= 0) {
        this._select(this.hoveredIdx);
      }
      input.keys[' '] = false;
      input.keys['enter'] = false;
      return;
    }

    this._draw();
  }

  exit() {
    const canvas = this.game.renderer.canvas;
    if (this.touchHandler) canvas.removeEventListener('touchstart', this.touchHandler);
    if (this.mouseHandler) canvas.removeEventListener('mousedown', this.mouseHandler);
    this.touchHandler = null;
    this.mouseHandler = null;
  }

  /** Responsive card layout (CSS px) — stacked on narrow screens. */
  _layout() {
    const w = this.game.renderer.displayWidth;
    const h = this.game.renderer.displayHeight;
    const safe = this.game.safeInsets || { top: 0, bottom: 0 };
    const s = clamp(Math.min(w / 700, h / 800), 0.6, 1);

    if (w < 560) {
      // Portrait / phone: stack cards vertically
      const cardW = Math.min(300, w - 36);
      const availH = h - safe.top - safe.bottom - 140;
      const cardH = clamp(availH / 3.2, 84, 128);
      const gap = 14;
      const totalH = cardH * 3 + gap * 2;
      const startX = (w - cardW) / 2;
      const startY = Math.max(safe.top + 64, (h - totalH) / 2);
      return {
        w, h, s, compact: true,
        titleY: safe.top + 44,
        hintY: Math.min(h - safe.bottom - 14, startY + totalH + 34),
        cards: [0, 1, 2].map(i => ({ x: startX, y: startY + i * (cardH + gap) })),
        cardW, cardH,
      };
    }

    // Desktop / tablet landscape: three cards side by side
    const cardW = Math.min(180, (w - 80) / 3);
    const cardH = 220;
    const gap = 20;
    const totalW = cardW * 3 + gap * 2;
    const startX = (w - totalW) / 2;
    const startY = Math.max(safe.top + 24, h / 2 - cardH / 2);
    return {
      w, h, s, compact: false,
      titleY: Math.max(safe.top + 44, h * 0.16),
      hintY: h - safe.bottom - 24,
      cards: [0, 1, 2].map(i => ({ x: startX + i * (cardW + gap), y: startY })),
      cardW, cardH,
    };
  }

  _draw() {
    const ctx = this.game.renderer.ctx;
    const L = this._layout();
    const { w, h, s, compact } = L;

    // Dim overlay
    ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.round(26 * s)}px monospace`;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.fillText('CHOOSE A BLESSING', w / 2, L.titleY);
    ctx.shadowBlur = 0;

    const iconSize = compact ? 26 : 36;
    const nameSize = compact ? 13 : 14;
    const descSize = compact ? 11 : 12;
    const descLineH = compact ? 14 : 16;

    for (let i = 0; i < this.options.length; i++) {
      const card = this.options[i];
      const c = L.cards[i];
      const isHovered = this.hoveredIdx === i;

      // Card background
      const glow = isHovered ? 15 + 5 * Math.sin(this.pulsePhase) : 0;
      ctx.save();
      if (glow > 0) {
        ctx.shadowColor = card.color || '#ffd700';
        ctx.shadowBlur = glow;
      }

      ctx.fillStyle = isHovered ? '#1e1e3a' : '#141428';
      ctx.strokeStyle = isHovered ? (card.color || '#ffd700') : '#333';
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.fillRect(c.x, c.y, L.cardW, L.cardH);
      ctx.strokeRect(c.x, c.y, L.cardW, L.cardH);
      ctx.restore();

      const midX = c.x + L.cardW / 2;

      // Icon — image or fallback emoji
      const upgradeId = card.id;
      const iconImg = this.iconImages[upgradeId];
      const iconSize = compact ? 28 : 42;
      if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
        ctx.save();
        const iconY = c.y + (compact ? 28 : 50);
        ctx.shadowColor = card.color || '#ffd700';
        ctx.shadowBlur = isHovered ? 10 : 5;
        ctx.drawImage(iconImg, midX - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize);
        ctx.restore();
      } else {
        ctx.save();
        ctx.shadowColor = card.color || '#ffd700';
        ctx.shadowBlur = 10;
        ctx.fillStyle = card.color || '#ffd700';
        ctx.font = `${iconSize}px serif`;
        ctx.fillText(card.icon, midX, c.y + (compact ? 32 : 60));
        ctx.restore();
      }

      // Name
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${nameSize}px monospace`;
      ctx.fillText(card.name, midX, c.y + (compact ? 58 : 100));

      // Description
      ctx.fillStyle = '#aaa';
      ctx.font = `${descSize}px monospace`;
      const lines = this._wrapText(ctx, card.description, L.cardW - 24, descSize);
      const maxLines = compact ? 2 : 4;
      for (let j = 0; j < Math.min(lines.length, maxLines); j++) {
        ctx.fillText(lines[j], midX, c.y + (compact ? 76 : 126) + j * descLineH);
      }

      // Stack count
      if (card.stackable) {
        const count = this.game.upgradeSystem.selectedUpgrades.filter(u => u.id === card.id).length;
        if (count > 0) {
          ctx.fillStyle = '#ffd700';
          ctx.font = '11px monospace';
          ctx.fillText(`[x${count}]`, midX, c.y + L.cardH - 12);
        }
      }
    }

    // Navigation hint
    ctx.fillStyle = '#888';
    ctx.font = `${Math.round(12 * s)}px monospace`;
    const hint = CAN_TOUCH
      ? 'TAP A CARD TO ACCEPT THE BLESSING'
      : '← → to navigate  •  SPACE to select';
    ctx.fillText(hint, w / 2, L.hintY);

    ctx.textAlign = 'left';
  }

  _wrapText(ctx, text, maxWidth, fontSize) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}

// ── Game over state ──────────────────────────────────────────────

class GameOverState {
  constructor(game) {
    this.game = game;
    this.pulsePhase = 0;
    this._handler = null;
    this._tapHandler = null;
    this._readyAt = 0;
    this._lastTouchEnd = 0;
  }

  enter() {
    const score = this.game.score;
    // Compute final score (survival time + per-enemy kill score)
    score.total = Math.floor(score.elapsed * 10) + (score.killScore || 0);

    // Save high score
    const saved = parseInt(localStorage.getItem('thunderclash_highscore')) || 0;
    if (score.total > saved) {
      localStorage.setItem('thunderclash_highscore', score.total);
    }

    // Save god unlocks
    const unlocked = JSON.parse(localStorage.getItem('thunderclash_unlocked') || '["zeus"]');
    const currentGod = this.game.gods[this.game.selectedGodIndex];
    if (currentGod && !unlocked.includes(currentGod.id)) {
      unlocked.push(currentGod.id);
      localStorage.setItem('thunderclash_unlocked', JSON.stringify(unlocked));
    }

    Haptics.death();

    // Tap to continue (with a short guard so a stray combat tap
    // doesn't skip the screen).
    const canvas = this.game.renderer.canvas;
    const go = () => {
      if (performance.now() < this._readyAt) return;
      Haptics.tap();
      this.game.stateMachine.enter('menu');
    };
    const tapHandler = (e) => {
      this._lastTouchEnd = performance.now();
      go();
    };
    const clickHandler = (e) => {
      if (performance.now() - this._lastTouchEnd < 700) return;
      go();
    };
    canvas.addEventListener('touchend', tapHandler, { passive: true });
    canvas.addEventListener('click', clickHandler);
    this._handler = clickHandler;
    this._tapHandler = tapHandler;
    this._readyAt = performance.now() + 600;

    this._draw();
  }

  update(dt) {
    this.pulsePhase += dt * 3;
    const input = this.game.input;
    if (input.keys[' '] || input.keys['enter'] || input.keys['escape']) {
      input.keys[' '] = false;
      input.keys['enter'] = false;
      input.keys['escape'] = false;
      this.game.stateMachine.enter('menu');
      return;
    }
    this._draw();
  }

  exit() {
    const canvas = this.game.renderer.canvas;
    if (this._handler) canvas.removeEventListener('click', this._handler);
    if (this._tapHandler) canvas.removeEventListener('touchend', this._tapHandler);
    this._handler = null;
    this._tapHandler = null;
  }

  _draw() {
    const ctx = this.game.renderer.ctx;
    const w = this.game.renderer.displayWidth;
    const h = this.game.renderer.displayHeight;
    const safe = this.game.safeInsets || { top: 0, bottom: 0 };
    const s = clamp(Math.min(w / 640, h / 760), 0.6, 1);
    const score = this.game.score;

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    // Death text
    ctx.fillStyle = '#d32f2f';
    ctx.font = `bold ${Math.round(38 * s)}px monospace`;
    ctx.shadowColor = '#d32f2f';
    ctx.shadowBlur = 15;
    ctx.fillText('YOU HAVE FALLEN', w / 2, h * 0.28);
    ctx.shadowBlur = 0;

    // Stats
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.round(22 * s)}px monospace`;
    ctx.fillText(`Score: ${score.total}`, w / 2, h * 0.42);

    ctx.fillStyle = '#ccc';
    ctx.font = `${Math.round(14 * s)}px monospace`;
    const m = Math.floor(score.elapsed / 60);
    const sec = Math.floor(score.elapsed % 60);
    ctx.fillText(
      `${m}:${sec.toString().padStart(2, '0')}  •  Wave ${this.game.waveSystem.currentWave}  •  Kills ${score.kills}`,
      w / 2, h * 0.50
    );

    // High score
    const highScore = parseInt(localStorage.getItem('thunderclash_highscore')) || 0;
    ctx.fillStyle = '#ffd700';
    ctx.font = `${Math.round(13 * s)}px monospace`;
    ctx.fillText(`High Score: ${highScore}`, w / 2, h * 0.57);

    // Restart prompt
    const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.4 + pulse * 0.6})`;
    ctx.font = `bold ${Math.round(16 * s)}px monospace`;
    const prompt = CAN_TOUCH ? 'TAP TO RETURN TO OLYMPUS' : 'PRESS SPACE TO RETURN TO OLYMPUS';
    ctx.fillText(prompt, w / 2, Math.min(h * 0.72, h - safe.bottom - 40));

    ctx.textAlign = 'left';
  }
}

export default GameState;
