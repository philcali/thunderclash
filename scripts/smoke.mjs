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

// Offscreen canvases (enemy sprite baking) + DOM for safe-area probing
globalThis.Image = class {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
};
globalThis.document = {
  createElement: (tag) => tag === 'canvas'
    ? { width: 0, height: 0, style: {}, getContext: () => ctxStub, remove: () => {} }
    : { style: {}, remove: () => {} },
  body: { appendChild: () => {} },
};

globalThis.window = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
  addEventListener: () => {}, removeEventListener: () => {},
  getComputedStyle: () => ({}),
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
const { getWaveConfig, totalForWave } = await import('../src/data/levels.js');
assert.strictEqual(getWaveConfig(5).boss, 'medusa', 'wave 5 boss = medusa');
assert.strictEqual(getWaveConfig(10).boss, 'hydra', 'wave 10 boss = hydra');
assert.strictEqual(getWaveConfig(15).boss, 'medusa', 'wave 15 boss = medusa');
assert.strictEqual(getWaveConfig(20).boss, 'hydra', 'wave 20 boss = hydra');
assert.strictEqual(getWaveConfig(25).boss, 'medusa', 'wave 25 (procedural) boss');
assert.ok(getWaveConfig(5).enemies.minotaur > 0, 'mediums appear by wave 5');
assert.ok(getWaveConfig(8).enemies.cerberus > 0, 'cerberus appears by wave 8');

// Ramp A: aggressive geometric growth, monotonic, hard-capped at 1200
assert.ok(totalForWave(10) > totalForWave(5) * 1.5, `ramp: W10 (${totalForWave(10)}) > 1.5× W5 (${totalForWave(5)})`);
assert.ok(totalForWave(15) > totalForWave(10) * 1.5, `ramp: W15 (${totalForWave(15)}) > 1.5× W10`);
assert.ok(totalForWave(20) >= 700, `ramp: W20 ≥ 700 (got ${totalForWave(20)})`);
assert.ok(totalForWave(21) >= totalForWave(20), 'ramp: monotonic across the cap');
assert.strictEqual(totalForWave(100), 1200, 'ramp: capped at 1200');
for (const w of [3, 7, 12, 25, 50]) {
  const sum = Object.values(getWaveConfig(w).enemies).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, totalForWave(w), `wave ${w} composition sums to its total (${sum})`);
}
console.log(`✓ wave data (ramp ${totalForWave(1)}→${totalForWave(5)}→${totalForWave(10)}→${totalForWave(20)}→1200 cap, boss every 5)`);

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

// ── Ability system (the gods' secondary move) ──
const { GODS } = await import('../src/data/gods.js');
const em = game.entityManager;
const ab = game.abilitySystem;
assert.ok(ab, 'abilitySystem created with the game');
assert.strictEqual(ab.ability.id, 'thunder_barrier', 'zeus gets Thunder Barrier');
assert.ok(ab.ready, 'ability starts ready');

// Keep player + world alive while we poke at it
game.player.invincible = true;
game.player.invincibleTimer = 1e9;
for (const e of em.getByType('enemy')) { e.health = 99999; e.maxHealth = 99999; }

// Zeus: damage + stun inside the radius, nothing outside
const victim = em.create({ type: 'enemy', def: { color: '#fff' }, x: 80, y: 0, radius: 10, health: 99999, maxHealth: 99999, pushbackX: 0, pushbackY: 0 });
const far = em.create({ type: 'enemy', def: { color: '#fff' }, x: 320, y: 0, radius: 10, health: 99999, maxHealth: 99999, pushbackX: 0, pushbackY: 0 });
em.update(0.016);
assert.strictEqual(ab.tryActivate(), true, 'zeus ability activates');
assert.strictEqual(victim.health, 99999 - 40, 'barrier dealt 40');
assert.ok(victim.stunTimer > 0, 'victim stunned');
assert.strictEqual(far.health, 99999, 'out-of-range enemy untouched');
assert.ok(!ab.ready, 'cooldown running after use');
em.update(0.016);
assert.ok(em.getByType('ring').length >= 2, 'shockwave rings spawned');

// Poseidon: three radial bursts of water bullets
game.player.god = GODS.find((g) => g.id === 'poseidon');
ab.cooldownRemaining = 0;
assert.ok(ab.ready, 'ready after cooldown reset');
assert.strictEqual(ab.tryActivate(), true, 'poseidon ability activates');
em.update(0.016);
let wave = em.getByType('projectile').filter((p) => p.projectileType === 'wave').length;
assert.strictEqual(wave, 12, `first burst fires 12 bullets (got ${wave})`);
for (let i = 0; i < 30; i++) { ab.update(1 / 60); if (i % 2 === 0) em.update(1 / 60); }
wave = em.getByType('projectile').filter((p) => p.projectileType === 'wave').length;
assert.ok(wave >= 24, `bursts 2-3 added their bullets (${wave} total)`);

// Hades: homing soulfire + a persistent burn zone
game.player.god = GODS.find((g) => g.id === 'hades');
ab.cooldownRemaining = 0;
assert.strictEqual(ab.tryActivate(), true, 'hades ability activates');
em.update(0.016);
const bolts = em.getByType('projectile').filter((p) => p.projectileType === 'soulfire').length;
assert.ok(bolts >= 16, `homing bolts spawned (${bolts})`);
assert.ok(em.getByType('zone').length >= 1, 'burn zone spawned');

// Athena: invulnerability + shield + knockback ring
game.player.god = GODS.find((g) => g.id === 'athena');
ab.cooldownRemaining = 0;
game.player.shield = 0;
for (const e of em.getByType('enemy')) { e.pushbackX = 0; e.pushbackY = 0; }
assert.strictEqual(ab.tryActivate(), true, 'athena ability activates');
assert.ok(game.player.invincible, 'aegis grants i-frames');
assert.ok(game.player.shield >= 30, 'aegis grants shield');
assert.ok(
  em.getByType('enemy').some((e) => Math.abs(e.pushbackX) > 10 || Math.abs(e.pushbackY) > 10),
  'enemies in the ring were shoved'
);

// Ares: aimed cone (auto-aims at the nearest enemy when no manual aim)
game.player.god = GODS.find((g) => g.id === 'ares');
ab.cooldownRemaining = 0;
const victim3 = em.create({ type: 'enemy', def: { color: '#fff' }, x: 200, y: 0, radius: 10, health: 99999, maxHealth: 99999, pushbackX: 0, pushbackY: 0 });
em.update(0.016);
assert.strictEqual(ab.tryActivate(), true, 'ares ability activates');
assert.strictEqual(victim3.health, 99999 - 90, 'wrath dealt 90');
assert.ok(victim3.pushbackX > 10, 'wrath slammed the enemy back');

// Mobile: tapping the fixed button queues a press (and no aim stick)
const btn = game.input.abilityButtonRect();
fire('touchstart', btn.cx, btn.cy, 9);
assert.ok(game.input.abilityPressed, 'button tap queues the ability');
assert.strictEqual(game.input.stickAim.active, false, 'button tap does not spawn the aim stick');
assert.ok(game.input.consumeAbilityPress(), 'press consumes once');
assert.strictEqual(game.input.consumeAbilityPress(), false, '…and only once');
fire('touchend', btn.cx, btn.cy, 9);
console.log('✓ ability system (5 gods, cooldown, button)');

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

// ── XP orbs + leveling (kills → orbs → level up → blessing screen) ──
const ws = game.waveSystem;
// Test hygiene: clear stray orbs/XP from the combat tests above
for (const o of em.getByType('xp')) em.remove(o.id);
em.update(0.016);
game.levelSystem.xp = 0;
game.levelSystem.pending = 0;

// Kills drop orbs that drift toward the player and are collected on contact
assert.strictEqual(em.getByType('xp').length, 0, 'no stray orbs');
ws._spawnXpOrb(50, 0, 1);
em.update(0.016); // commit deferred add (orb may already be drifting in)
assert.strictEqual(em.getByType('xp').length, 1, 'xp orb spawns');
const orb = em.getByType('xp')[0];
assert.strictEqual(orb.value, 1, 'orb carries the xp value');
orb.x = 0; orb.y = 0; // teleport onto the player
em.update(0.016);
assert.ok(!em.getByType('xp').includes(orb), 'orb collected on contact');
assert.strictEqual(game.levelSystem.xp, 1, 'xp banked');

// Big XP gain → level up → blessing screen
game.levelSystem.addXp(100);
assert.ok(game.levelSystem.pending >= 1, 'level-up(s) queued');
step(20);
assert.strictEqual(game.stateMachine.name, 'upgradeSelect', 'level up → blessing screen');
const us = game.stateMachine.states.upgradeSelect;
const U = us._layout();
assert.ok(U.compact, 'compact layout on phone');
// Deterministic pick (skip random field/new-god cards for this assertion)
const { UPGRADES } = await import('../src/data/blessings.js');
const zeusFury = UPGRADES.find((u) => u.id === 'zeus_fury');
us.options = [zeusFury, zeusFury, zeusFury];
us.hoveredIdx = -1;
game.levelSystem.pending = 1; // exactly one queued pick
fire('touchstart', U.cards[1].x + 10, U.cards[1].y + 10);
assert.strictEqual(game.stateMachine.name, 'playing', 'blessing selected → back to playing');
assert.strictEqual(game.levelSystem.pending, 0, 'pick queue drained');
console.log('✓ xp orbs + leveling → blessing screen');

// ── Wave end: breather, then auto next wave (no card screen) ──
const waveBefore = ws.currentWave;
ws.betweenWaves = true;
ws.waveDelay = 0;
ws.enemiesRemaining = 0;
ws.spawnQueue.length = 0;
step(20);
assert.strictEqual(game.stateMachine.name, 'playing', 'wave end stays in playing (no card screen)');
assert.ok(ws.currentWave >= waveBefore + 1, `next wave auto-started (now wave ${ws.currentWave})`);
console.log('✓ wave auto-advance');

// ── Field consumables: turrets + mines ──
const fs = game.fieldSystem;
fs.clear();
fs.deployTurrets(2, 0, 0);
assert.strictEqual(fs.turrets.length, 2, 'deployed 2 turrets');
fs.deployTurrets(5, 0, 0);
assert.strictEqual(fs.turrets.length, 3, 'turret cap of 3 (oldest rotated out)');
const tVictim = em.create({ type: 'enemy', def: { color: '#fff' }, x: 100, y: 0, radius: 10, health: 99999, maxHealth: 99999, pushbackX: 0, pushbackY: 0 });
em.update(0.016);
let sawShot = false;
for (let i = 0; i < 90 && !sawShot; i++) {
  fs.update(1 / 60);
  em.update(1 / 60);
  sawShot = em.getByType('projectile').some((p) => p.projectileType === 'turret');
}
assert.ok(sawShot, 'turret acquires target and fires');
const tHp = tVictim.health;
step(60); // full frames: bullet flight + collision resolution
assert.ok(tVictim.health < tHp, `turret shot connected (hp ${tVictim.health})`);

fs.clear();
fs.deployMines(1, 0, 0);
assert.strictEqual(fs.mines.length, 1, 'deployed a mine');
const mine = fs.mines[0];
// 99999hp: stray Hades burn-zone damage from the ability tests above also
// ticks this spot, so keep the victim unkillable (no stray XP orbs).
const mVictim = em.create({ type: 'enemy', def: { color: '#fff' }, x: mine.x, y: mine.y, radius: 10, health: 99999, maxHealth: 99999, pushbackX: 0, pushbackY: 0 });
em.update(0.016);
for (let i = 0; i < 120 && fs.mines.length > 0; i++) {
  fs.update(1 / 60);
  em.update(1 / 60);
}
assert.strictEqual(fs.mines.length, 0, 'mine detonated on contact');
assert.ok(mVictim.health < 99999, `blast dealt damage (hp ${mVictim.health})`);
fs.deployMines(6, 0, 0);
assert.strictEqual(fs.mines.length, 4, 'mine cap of 4 (oldest rotated out)');
fs.clear();
console.log('✓ field consumables (turrets + mines)');

// ── Boss wave (wave 10 → Hydra, scaled + announced) ──
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
let cerb2 = game.entityManager.getByType('enemy').find((e) => e.enemyType === 'cerberus');
if (!cerb2) cerb2 = ws.spawnEnemyAt('cerberus', 60, 60);
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
// Test hygiene: combat above can legitimately queue a level-up (a stray enemy
// dies near the player → XP orb → blessing screen). Drain it so the world
// keeps simulating for this assertion.
{
  game.levelSystem.pending = 0;
  game.levelSystem.xp = 0;
  for (const o of em.getByType('xp')) em.remove(o.id);
  em.update(0.016); // commit orb removals
  while (game.stateMachine.name === 'upgradeSelect') {
    game.levelSystem.pending = 1; // exactly one pick to clear
    const us2 = game.stateMachine.states.upgradeSelect;
    us2.options = [zeusFury, zeusFury, zeusFury];
    const U3 = us2._layout();
    fire('touchstart', U3.cards[0].x + 10, U3.cards[0].y + 10);
  }
  assert.strictEqual(game.stateMachine.name, 'playing', 'drained queued blessing → back in playing');
}
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
