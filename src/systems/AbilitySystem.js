/**
 * AbilitySystem — the god's secondary move.
 *
 * Cooldown-based (starts ready). Effects run as world entities (rings,
 * burn zones, homing bolts) plus a small delayed-action queue for
 * sequenced effects (Poseidon's 3-burst Tidal Wave).
 *
 * Only ticks while in the playing state, so the cooldown pauses
 * naturally on the upgrade screen.
 */
import { ABILITIES } from '../data/abilities.js';
import Haptics from '../game/Haptics.js';
import CollisionSystem from './CollisionSystem.js';

class AbilitySystem {
  constructor(game) {
    this.game = game;
    this.cooldownRemaining = 0;
    this.pending = []; // { time, fn } — delayed actions
  }

  get ability() {
    const godId = this.game.player?.god?.id || 'zeus';
    return ABILITIES[godId] || ABILITIES.zeus;
  }

  get ready() { return this.cooldownRemaining <= 0; }
  get cooldownTotal() { return this.ability.cooldown; }

  update(dt) {
    if (this.cooldownRemaining > 0) this.cooldownRemaining -= dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.time -= dt;
      if (p.time <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }
  }

  /** Fire if ready. Returns true if it activated. */
  tryActivate() {
    if (!this.ready) return false;
    this._activate();
    this.cooldownRemaining = this.ability.cooldown;
    Haptics.ability();
    return true;
  }

  _activate() {
    switch (this.ability.id) {
      case 'thunder_barrier': return this._thunderBarrier();
      case 'tidal_wave':      return this._tidalWave();
      case 'soulfire_vortex': return this._soulfireVortex();
      case 'aegis':           return this._aegis();
      case 'wrath':           return this._wrath();
    }
  }

  // ── Shared helpers ──────────────────────────────────────────────

  _enemies() {
    return this.game.entityManager.getByType('enemy');
  }

  /** Damage an enemy, with wave bookkeeping + death cleanup. */
  _hurt(enemy, amount) {
    if (enemy.health <= 0) return;
    enemy.health -= amount;
    if (enemy.health <= 0) {
      this.game.waveSystem.onEnemyKilled(enemy);
      this.game.entityManager.remove(enemy.id);
      CollisionSystem._spawnDeath(this.game.entityManager, enemy.x, enemy.y, enemy.color, 8);
    }
  }

  _stun(enemy, duration) {
    enemy.stunTimer = Math.max(enemy.stunTimer || 0, duration);
  }

  /** Expanding shockwave ring (visual only). */
  _ring(x, y, maxRadius, color, duration = 0.5, width = 6) {
    const e = this.game.entityManager.create({
      type: 'ring', x, y, maxRadius, color, width,
      progress: 0, duration,
    });
    e.update = (dt) => {
      e.progress += dt / e.duration;
      if (e.progress >= 1) this.game.entityManager.remove(e.id);
    };
  }

  // ── Zeus: Thunder Barrier (damage + stun) ───────────────────────

  _thunderBarrier() {
    const a = this.ability;
    const p = this.game.player;
    for (const enemy of this._enemies()) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      if (dx * dx + dy * dy > a.radius * a.radius) continue;
      this._stun(enemy, a.stunDuration);
      CollisionSystem._spawnHit(this.game.entityManager, enemy.x, enemy.y, a.color, 4);
      this._hurt(enemy, a.damage);
    }
    this._ring(p.x, p.y, a.radius, a.color, 0.5, 8);
    this._ring(p.x, p.y, a.radius * 0.6, '#ffffff', 0.3, 3);
  }

  // ── Poseidon: Tidal Wave (3 radial bursts) ──────────────────────

  _tidalWave() {
    const a = this.ability;
    const p = this.game.player;
    const fireBurst = (n) => {
      for (let i = 0; i < a.bulletsPerBurst; i++) {
        // Slight rotation per burst so the rings don't perfectly overlap
        const angle = (i / a.bulletsPerBurst) * Math.PI * 2 + n * 0.13;
        this._spawnAbilityBullet(p.x, p.y, angle, a);
      }
      this._ring(p.x, p.y, 50 + n * 35, a.color, 0.4, 4);
    };
    fireBurst(0);
    for (let n = 1; n < a.bursts; n++) {
      this.pending.push({ time: a.burstInterval * n, fn: () => fireBurst(n) });
    }
  }

  _spawnAbilityBullet(x, y, angle, a) {
    const proj = this.game.entityManager.create({
      type: 'projectile',
      projectileType: 'wave',
      x, y,
      vx: Math.cos(angle) * a.bulletSpeed,
      vy: Math.sin(angle) * a.bulletSpeed,
      damage: a.bulletDamage,
      radius: 6,
      color: a.color,
      pierce: a.bulletPierce,
      owner: 'player',
      lifetime: 1.6,
      splashRadius: 20,
      knockback: a.knockback,
    });
    proj.update = (dt) => {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.lifetime -= dt;
      if (proj.lifetime <= 0) this.game.entityManager.remove(proj.id);
    };
  }

  // ── Hades: Soulfire Vortex (homing bolts + burn zone) ───────────

  _soulfireVortex() {
    const a = this.ability;
    const p = this.game.player;
    for (let i = 0; i < a.bolts; i++) {
      const angle = (i / a.bolts) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speed = a.boltSpeed * (0.8 + Math.random() * 0.4);
      const bolt = this.game.entityManager.create({
        type: 'projectile',
        projectileType: 'soulfire',
        x: p.x, y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: a.boltDamage,
        radius: 5,
        color: a.color,
        pierce: a.boltPierce,
        owner: 'player',
        lifetime: 3,
        splashRadius: 0,
      });
      bolt.update = (dt) => this._updateHomingBolt(bolt, dt);
    }
    this._spawnBurnZone(p.x, p.y, a);
    this._ring(p.x, p.y, a.zoneRadius, a.color, 0.5, 5);
  }

  /** Steer a bolt toward the nearest enemy (turn-rate limited). */
  _updateHomingBolt(bolt, dt) {
    const nearby = this.game.entityManager.getNearby(bolt.x, bolt.y, 320);
    let target = null;
    let best = Infinity;
    for (const e of nearby) {
      if (e.type !== 'enemy' || e.health <= 0) continue;
      const dx = e.x - bolt.x;
      const dy = e.y - bolt.y;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; target = e; }
    }
    if (target) {
      const speed = Math.sqrt(bolt.vx * bolt.vx + bolt.vy * bolt.vy) || 1;
      const desired = Math.atan2(target.y - bolt.y, target.x - bolt.x);
      let cur = Math.atan2(bolt.vy, bolt.vx);
      let diff = desired - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = Math.max(-6 * dt, Math.min(6 * dt, diff)); // ~6 rad/s
      cur += turn;
      bolt.vx = Math.cos(cur) * speed;
      bolt.vy = Math.sin(cur) * speed;
    }
    bolt.x += bolt.vx * dt;
    bolt.y += bolt.vy * dt;
    bolt.lifetime -= dt;
    if (bolt.lifetime <= 0) this.game.entityManager.remove(bolt.id);
  }

  _spawnBurnZone(x, y, a) {
    const zone = this.game.entityManager.create({
      type: 'zone', x, y,
      radius: a.zoneRadius,
      color: a.color,
      duration: a.zoneDuration,
      maxDuration: a.zoneDuration,
      dps: a.zoneDps,
    });
    zone.update = (dt) => {
      zone.duration -= dt;
      if (zone.duration <= 0) {
        this.game.entityManager.remove(zone.id);
        return;
      }
      for (const e of this.game.entityManager.getNearby(zone.x, zone.y, zone.radius)) {
        if (e.type !== 'enemy' || e.health <= 0) continue;
        this._hurt(e, zone.dps * dt);
      }
    };
  }

  // ── Athena: Aegis (invuln + knockback ring + shield) ────────────

  _aegis() {
    const a = this.ability;
    const p = this.game.player;
    p.invincible = true;
    p.invincibleTimer = Math.max(p.invincibleTimer, a.invulnDuration);
    p.shield += a.shield;
    p.shieldTimer = Math.max(p.shieldTimer, 30);
    for (const enemy of this._enemies()) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > a.ringRadius) continue;
      // Tapered shove: strongest up close
      const push = a.knockback * (1 - d / (a.ringRadius * 1.6));
      enemy.pushbackX += (dx / d) * push;
      enemy.pushbackY += (dy / d) * push;
      this._hurt(enemy, a.ringDamage);
    }
    this._ring(p.x, p.y, a.ringRadius, a.color, 0.5, 7);
    this._ring(p.x, p.y, a.ringRadius * 0.5, '#ffffff', 0.35, 3);
  }

  // ── Ares: Wrath (aimed shock cone, heavy damage + knockback) ────

  _wrath() {
    const a = this.ability;
    const p = this.game.player;

    // Aim direction: manual aim, else nearest enemy (else a full ring).
    let dir = this.game.input.getAimDir();
    if (!dir) {
      let best = null;
      let bestD = Infinity;
      for (const e of this._enemies()) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        const dx = best.x - p.x;
        const dy = best.y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        dir = { x: dx / len, y: dy / len };
      }
    }

    const cosHalf = Math.cos(a.halfAngle);
    for (const enemy of this._enemies()) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > a.range) continue;
      if (dir && (dx / d) * dir.x + (dy / d) * dir.y < cosHalf) continue;
      const push = a.knockback * (1 - d / (a.range * 1.5));
      const px = dir ? dir.x : dx / d;
      const py = dir ? dir.y : dy / d;
      enemy.pushbackX += px * push;
      enemy.pushbackY += py * push;
      CollisionSystem._spawnHit(this.game.entityManager, enemy.x, enemy.y, a.color, 5);
      this._hurt(enemy, a.damage);
    }
    this._ring(p.x, p.y, a.range, a.color, 0.5, 8);
    this._ring(p.x, p.y, a.range * 0.55, '#ffffff', 0.3, 3);
  }
}

export default AbilitySystem;
