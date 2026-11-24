/**
 * FieldSystem — environment consumables deployed by blessing cards.
 *
 * Turrets: auto-aim at the nearest enemy in range, fire single shots.
 * Mines:   armed after a fuse, detonate on first enemy contact with a
 *          radial blast (damage + knockback).
 *
 * Deployments are finite (life in seconds) and capped (max count);
 * picking the card again pushes the oldest one out.
 */
import Haptics from '../game/Haptics.js';
import CollisionSystem from './CollisionSystem.js';

export const TURRET = {
  range: 180,
  fireInterval: 0.4,
  damage: 15,
  bulletSpeed: 380,
  life: 30,
  max: 3,
};

export const MINE = {
  triggerRadius: 40,
  blastRadius: 70,
  damage: 60,
  knockback: 400,
  life: 20,
  max: 4,
  fuse: 0.8, // arming delay after deploy
};

class FieldSystem {
  constructor(game) {
    this.game = game;
    this.turrets = [];
    this.mines = [];
    this._n = 0; // deploy offsets
  }

  // ── Deployment ─────────────────────────────────────────────────

  deployTurrets(n, x, y) {
    for (let i = 0; i < n; i++) {
      const a = (this._n++ / 3) * Math.PI * 2 + i * 1.1;
      const d = i === 0 ? 0 : 26;
      this.turrets.push({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        angle: a,
        fireTimer: 0,
        flash: 0,
        life: TURRET.life,
      });
    }
    while (this.turrets.length > TURRET.max) this.turrets.shift();
  }

  deployMines(n, x, y) {
    for (let i = 0; i < n; i++) {
      const a = (this._n++ / 4) * Math.PI * 2 + i * 2.3;
      const d = i === 0 ? 10 : 30;
      this.mines.push({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        fuse: MINE.fuse,
        life: MINE.life,
      });
    }
    while (this.mines.length > MINE.max) this.mines.shift();
  }

  clear() {
    this.turrets.length = 0;
    this.mines.length = 0;
  }

  // ── Update ─────────────────────────────────────────────────────

  update(dt) {
    const em = this.game.entityManager;

    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.life -= dt;
      t.flash = Math.max(0, t.flash - dt * 6);
      if (t.life <= 0) { this.turrets.splice(i, 1); continue; }
      t.fireTimer -= dt;

      // Acquire + track nearest enemy in range
      let target = null, bd = TURRET.range * TURRET.range;
      for (const e of em.getByType('enemy')) {
        if (e.health <= 0) continue;
        const d2 = (e.x - t.x) * (e.x - t.x) + (e.y - t.y) * (e.y - t.y);
        if (d2 < bd) { bd = d2; target = e; }
      }
      if (target) {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        if (t.fireTimer <= 0) {
          t.fireTimer = TURRET.fireInterval;
          t.flash = 1;
          this._fireTurretBullet(em, t);
        }
      }
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.life -= dt;
      if (m.life <= 0) { this.mines.splice(i, 1); continue; }
      if (m.fuse > 0) { m.fuse -= dt; continue; }

      // Armed: first enemy in trigger radius detonates it
      for (const e of em.getByType('enemy')) {
        if (e.health <= 0) continue;
        const d2 = (e.x - m.x) * (e.x - m.x) + (e.y - m.y) * (e.y - m.y);
        if (d2 < MINE.triggerRadius * MINE.triggerRadius) {
          this._explode(em, m);
          this.mines.splice(i, 1);
          break;
        }
      }
    }
  }

  _fireTurretBullet(em, t) {
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    const proj = em.create({
      type: 'projectile',
      projectileType: 'turret',
      x: t.x + c * 16,
      y: t.y + s * 16,
      vx: c * TURRET.bulletSpeed,
      vy: s * TURRET.bulletSpeed,
      damage: TURRET.damage,
      radius: 4,
      color: '#ffb74d',
      pierce: 0,
      owner: 'player', // CollisionSystem only resolves player-owned shots
      lifetime: 1.2,
      splashRadius: 0,
    });
    proj.update = (dt) => {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.lifetime -= dt;
      if (proj.lifetime <= 0) em.remove(proj.id);
    };
  }

  _explode(em, m) {
    const g = this.game;
    Haptics.explosion();

    // Shockwave ring (visual only)
    const ring = em.create({
      type: 'ring', x: m.x, y: m.y,
      maxRadius: MINE.blastRadius, color: '#ff5722', width: 8,
      progress: 0, duration: 0.4,
    });
    ring.update = (dt) => {
      ring.progress += dt / ring.duration;
      if (ring.progress >= 1) em.remove(ring.id);
    };

    for (const e of em.getByType('enemy')) {
      if (e.health <= 0) continue;
      const dx = e.x - m.x, dy = e.y - m.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > MINE.blastRadius) continue;
      const push = MINE.knockback * (1 - d / (MINE.blastRadius * 1.5));
      e.pushbackX = (e.pushbackX || 0) + (dx / d) * push;
      e.pushbackY = (e.pushbackY || 0) + (dy / d) * push;
      CollisionSystem._spawnHit(em, e.x, e.y, '#ff5722', 5);
      this._hurt(e, MINE.damage);
    }
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
}

export default FieldSystem;
