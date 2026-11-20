/**
 * WeaponSystem — auto-fire logic, aim resolution, projectile spawning.
 *
 * Aim priority:
 *   1. Manual aim (mouse on desktop, aim stick on touch).
 *   2. Auto-aim at the nearest enemy within range (when no manual aim).
 *   3. No fire (nothing to aim at).
 */
import { WEAPONS } from '../data/weapons.js';

class WeaponSystem {
  constructor(player, entityManager) {
    this.player = player;
    this.manager = entityManager;
    this.fireTimer = 0;
    this.lastAim = null; // direction of the last resolved shot (for HUD indicator)
  }

  update(dt, aimDir) {
    const weaponKey = this.player.god?.weapon || 'lightning';
    const baseWeapon = WEAPONS[weaponKey];
    if (!baseWeapon) return;

    // Merge weapon stats from blessings
    const weapon = {
      ...baseWeapon,
      damage: this.player.weaponStats.damage || baseWeapon.damage,
      fireRate: this.player.weaponStats.fireRate || baseWeapon.fireRate,
      projectileSpeed: this.player.weaponStats.projectileSpeed || baseWeapon.projectileSpeed,
      count: this.player.weaponStats.count || baseWeapon.count,
      pierce: this.player.weaponStats.pierce || baseWeapon.pierce,
      splashRadius: this.player.weaponStats.splashRadius || baseWeapon.splashRadius,
      chainCount: this.player.weaponStats.chainCount || baseWeapon.chainCount,
    };

    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    // Resolve aim: manual aim wins, else auto-aim at nearest enemy.
    const dir = aimDir || this._autoAim(weapon);
    if (!dir) return; // no manual aim and no enemy in range — hold fire
    this.lastAim = dir;

    // Fire projectiles
    for (let i = 0; i < weapon.count; i++) {
      const angle = Math.atan2(dir.y, dir.x);
      const spreadAngle = angle + (Math.random() - 0.5) * weapon.spread;
      const vx = Math.cos(spreadAngle) * weapon.projectileSpeed;
      const vy = Math.sin(spreadAngle) * weapon.projectileSpeed;

      const proj = this.manager.create({
        type: 'projectile',
        projectileType: weapon.projectileType,
        x: this.player.x,
        y: this.player.y,
        vx, vy,
        damage: weapon.damage,
        radius: weapon.projectileSize,
        color: weapon.color,
        pierce: weapon.pierce,
        owner: 'player',
        lifetime: 2,
        splashRadius: weapon.splashRadius,
        chainCount: weapon.chainCount,
        chains: [],
        dotDamage: weapon.dotDamage,
        dotDuration: weapon.dotDuration,
      });
      proj.update = (dt) => this._updateProjectile(proj, dt);
    }

    this.fireTimer = weapon.fireRate;
  }

  /** Find the nearest enemy within range; null if none. */
  _autoAim(weapon) {
    const range = weapon.autoAimRange > 0 ? weapon.autoAimRange : 420;
    const nearby = this.manager.getNearby(this.player.x, this.player.y, range);
    let closest = null;
    let closestDist = Infinity;
    for (const enemy of nearby) {
      if (enemy.type !== 'enemy') continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist && dist <= range) {
        closestDist = dist;
        closest = enemy;
      }
    }
    if (!closest) return null;
    const dx = closest.x - this.player.x;
    const dy = closest.y - this.player.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  _updateProjectile(proj, dt) {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.lifetime -= dt;
    if (proj.lifetime <= 0) {
      this.manager.remove(proj.id);
    }
  }
}

export default WeaponSystem;
