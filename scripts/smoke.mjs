/**
 * Headless smoke test — simulates a full mobile play session
 * (menu → playing → upgrade select → game over → menu) with a
 * fake 390x844 phone viewport, DPR 3, and touch events.
 *
 * Run: node scripts/smoke.mjs
 */
import assert from 'node:assert';

// ── Environment shims (must exist before game modules load) ──
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
storage.set('thunderclash_unlocked', JSON.stringify(['zeus', 'poseidon']));

let nowMs = 1_000_000;
const realNow = performance.now.bind(performance);
performance.now = () => nowMs;

const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };

// Universal canvas 2D context stub: any method call returns itself,
// any property read returns itself (so `ctx.measureText(x).width` works).
const ctxStub = new Proxy(function () {}, {
  get: (t, prop) => {
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === 'measureText') return () => ({ width: 100 });
    return ctxStub;
  },
  apply: () => ctxStub,
  set: () => true,
});

const canvas = {
  width: 0, height: 0,
  clientWidth: 390, clientHeight: 844,
  style: {},
  _listeners: {},
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  },
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
  getContext: () => ctxStub,
};

globalThis.window = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
  addEventListener: () => {}, removeEventListener: () => {},
};
Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 2, vibrate: () => true },
  configurable: true,
});

let ts = 0;
function step(frames = 1) {
  for (let i = 0; i < frames; i++) {
    const cbs = rafQueue.splice(0);
    ts += 16.7;
    nowMs += 16.7;
    for (const cb of cbs) cb(ts);
  }
}

function fire(type, clientX, clientY, identifier = 1) {
  const e = {
    preventDefault: () => {},
    changedTouches: [{ identifier, clientX, clientY }],
    clientX, clientY,
  };
  for (const fn of canvas._listeners[type] || []) fn(e);
}

// ── Boot ──
const { default: Game } = await import('../src/game/Game.js');
const game = new Game(canvas);
await game.start();
assert.strictEqual(game.stateMachine.name, 'menu', 'boots into menu');
assert.strictEqual(canvas.width, 390 * 2.5, 'canvas scaled by DPR (capped at 2.5)');
console.log('✓ boot + DPR sizing');

// ── Wave data: mediums early, boss every 5 waves ──
const { getWaveConfig } = await import('../src/data/levels.js');
assert.strictEqual(getWaveConfig(5).boss, 'medusa', 'wave 5 boss = medusa');
assert.strictEqual(getWaveConfig(10).boss, 'hydra', 'wave 10 boss = hydra');
assert.strictEqual(getWaveConfig(15).boss, 'medusa', 'wave 15 boss = medusa');
assert.strictEqual(getWaveConfig(20).boss, 'hydra', 'wave 20 boss = hydra');
assert.strictEqual(getWaveConfig(25).boss, 'medusa', 'wave 25 (procedural) boss');
assert.ok(getWaveConfig(5).enemies.minotaur > 0, 'mediums appear by wave 5');
assert.ok(getWaveConfig(8).enemies.cerberus > 0, 'cerberus appears by wave 8');
console.log('✓ wave data (mediums early, boss every 5 waves)');

// ── Menu: cycle god with left nav arrow tap ──
step(2);
const L = game.stateMachine.states.menu._layout();
const godBefore = game.stateMachine.states.menu.selectedGod;
fire('touchend', L.navLeft.x + 5, L.navLeft.y + 5);
assert.notStrictEqual(game.stateMachine.states.menu.selectedGod, godBefore, 'left arrow cycles god');
fire('touchend', L.navRight.x + 5, L.navRight.y + 5);
assert.strictEqual(game.stateMachine.name, 'menu', 'nav taps do not start game');
console.log('✓ menu touch nav');

// ── Menu: tap center to start ──
fire('touchend', 195, 700);
assert.strictEqual(game.stateMachine.name, 'playing', 'tap starts game');
assert.ok(game.player, 'player created');
console.log('✓ menu start');

// ── Playing: virtual sticks ──
fire('touchstart', 80, 600, 7);   // left half → move stick
assert.ok(game.input.stickMove.active, 'move stick active');
fire('touchmove', 110, 640, 7);  // drag right-down
assert.ok(game.input.stickMove.mag > 0, 'stick has magnitude after drag');
game.input.updateMoveVector();
assert.ok(game.input.moveX > 0 || game.input.moveY > 0, 'movement output nonzero');
console.log('✓ movement stick');

fire('touchstart', 300, 500, 8); // right half → aim stick
fire('touchmove', 340, 500, 8);
game.input.updateMoveVector();
const aim = game.input.getAimDir();
assert.ok(aim && aim.x > 0, 'aim stick points right');
console.log('✓ aim stick');

// Auto-aim: enemy in range, no manual aim → weapon fires at it
fire('touchend', 340, 500, 8); // release aim
fire('touchend', 110, 640, 7); // release move
game.input.updateMoveVector();
game.player.x = 0; game.player.y = 0;
game.entityManager.create({
  type: 'enemy', def: { color: '#fff' }, x: 100, y: 0, radius: 10,
  health: 30, maxHealth: 30,
});
step(10);
const fired = game.entityManager.getByType('projectile').length;
assert.ok(fired > 0, `auto-aim fired (${fired} projectiles)`);
console.log('✓ auto-aim fires at nearest enemy');

// ── Upgrade select ──
game.waveSystem.betweenWaves = true;
game.waveSystem.waveDelay = 0;
game.waveSystem.enemiesRemaining = 0;
game.waveSystem.spawnQueue.length = 0;
step(20);
assert.strictEqual(game.stateMachine.name, 'upgradeSelect', 'wave end → upgrade select');
const U = game.stateMachine.states.upgradeSelect._layout();
assert.ok(U.compact, 'compact layout on phone');
fire('touchstart', U.cards[1].x + 10, U.cards[1].y + 10);
assert.strictEqual(game.stateMachine.name, 'playing', 'blessing selected');
console.log('✓ upgrade select (stacked cards)');

// ── Boss wave (wave 10 → Hydra, scaled + announced) ──
const ws = game.waveSystem;
ws.currentWave = 9;
ws.startWave();
assert.ok(ws.banner && ws.banner.text.includes('HYDRA'), 'boss banner announces Hydra');
assert.strictEqual(ws.bossType, 'hydra', 'boss queued for spawn');
step(70); // ~1.2s: covers the 1.0s boss telegraph + entity commit
const boss = game.entityManager.getByType('enemy').find((e) => e.isBoss);
assert.ok(boss, 'boss spawned in world');
assert.strictEqual(boss.maxHealth, 900, 'Hydra scaled 1.5× on wave 10 (600 → 900)');
console.log('✓ boss wave (announcement + scaling)');

// ── Cerberus death splits into hellhounds ──
const cerb = ws.spawnEnemyAt('cerberus', 60, 60);
const houndsBefore = game.entityManager.getByType('enemy').filter((e) => e.enemyType === 'hellhound').length;
ws.onEnemyKilled(cerb);
game.entityManager.update(0.016);
const houndsAfter = game.entityManager.getByType('enemy').filter((e) => e.enemyType === 'hellhound').length;
assert.strictEqual(houndsAfter, houndsBefore + 2, 'cerberus splits into 2 hellhounds');
console.log('✓ cerberus → hellhounds');

// ── Contact damage (regression: was `enemy.damage` undefined → NaN hp → immortal) ──
const cerb2 = game.entityManager.getByType('enemy').find((e) => e.enemyType === 'cerberus');
assert.ok(cerb2, 'a living cerberus exists for the contact test');
game.player.invincible = false;
game.player.invincibleTimer = 0;
game.player.shield = 0;
game.player.health = 50;
cerb2.x = 0; cerb2.y = 0; // teleport onto the player
cerb2.health = 99999; cerb2.maxHealth = 99999; // survive any friendly fire until contact
step(2);
assert.ok(Number.isFinite(game.player.health), 'hp stays finite after contact (was NaN)');
assert.strictEqual(game.player.health, 50 - cerb2.damage, `contact deals real damage (${cerb2.damage})`);
assert.ok(game.player.invincible, 'i-frames granted after hit');
console.log('✓ contact damage (finite, real value)');

// ── Game over via boss contact kill ──
const boss2 = game.entityManager.getByType('enemy').find((e) => e.isBoss);
game.player.invincible = false;
game.player.invincibleTimer = 0;
game.player.health = 20;
boss2.x = 0; boss2.y = 0;
boss2.health = 99999; boss2.maxHealth = 99999; // survive any friendly fire until contact
step(2);
assert.ok(game.player.health < 0, `boss contact overkills (hp ${game.player.health})`);
assert.strictEqual(game.stateMachine.name, 'gameOver', 'contact kill → game over');
// Stray tap within guard window is ignored
fire('touchend', 195, 400);
assert.strictEqual(game.stateMachine.name, 'gameOver', 'stray tap ignored');
step(40); // ~670ms
fire('touchend', 195, 400);
assert.strictEqual(game.stateMachine.name, 'menu', 'tap returns to menu');
console.log('✓ game over tap (with stray-tap guard)');

// ── Menu draw doesn't crash with multiple gods ──
step(3);
console.log('✓ menu re-draw');

performance.now = realNow;
console.log('\nAll smoke tests passed ✔');
