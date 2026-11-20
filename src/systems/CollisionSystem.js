/**
 * CollisionSystem — circle-circle collision detection and damage application.
 */
class CollisionSystem {
  static circleCollision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const distSq = dx * dx + dy * dy;
    const rSum = a.radius + b.radius;
    return distSq < rSum * rSum;
  }

  static resolve(projectiles, enemies, player, entityManager) {
    const projectilesToRemove = new Set();
    const enemiesToRemove = new Set();

    // Projectile-Enemy collisions
    for (const proj of projectiles) {
      if (proj.owner !== 'player') continue;
      if (projectilesToRemove.has(proj)) continue;

      for (const enemy of enemies) {
        if (projectilesToRemove.has(proj)) break;
        if (enemiesToRemove.has(enemy)) continue;
        if (this.circleCollision(proj, enemy)) {
          enemy.health -= proj.damage;
          // Pushback
          enemy.pushbackX += (proj.vx / Math.abs(proj.vx || 1)) * 5;
          enemy.pushbackY += (proj.vy / Math.abs(proj.vy || 1)) * 5;

          // Spawn hit particles
          this._spawnHit(entityManager, proj.x, proj.y, enemy.color, 5);

          // Splash damage
          if (proj.splashRadius > 0) {
            for (const other of enemies) {
              if (other === enemy) continue;
              const dx = other.x - proj.x;
              const dy = other.y - proj.y;
              if (dx * dx + dy * dy < proj.splashRadius * proj.splashRadius) {
                other.health -= proj.damage * 0.5;
              }
            }
          }

          // Check if enemy died
          if (enemy.health <= 0) {
            enemiesToRemove.add(enemy);
          }

          proj.pierce--;
          if (proj.pierce <= 0) {
            projectilesToRemove.add(proj);
          }
        }
      }
    }

    // Enemy-Player collisions (suicide on contact; tracked as kills so
    // wave-end bookkeeping always sees every dead enemy)
    for (const enemy of enemies) {
      if (enemiesToRemove.has(enemy)) continue;
      if (this.circleCollision(enemy, player)) {
        player.takeDamage(enemy.damage);
        enemiesToRemove.add(enemy);
      }
    }

    // Remove all dead enemies (shot down + contact deaths)
    for (const enemy of enemiesToRemove) {
      entityManager.remove(enemy.id);
      this._spawnDeath(entityManager, enemy.x, enemy.y, enemy.color, 10);
    }

    return { projectiles: projectilesToRemove, enemies: enemiesToRemove };
  }

  static _spawnHit(manager, x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;
      const p = manager.create({
        type: 'particle',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.3 + Math.random() * 0.2,
        color,
        size: 2 + Math.random() * 2,
      });
      p.update = (dt) => this._updateParticle(p, manager, dt);
    }
  }

  static _spawnDeath(manager, x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      const p = manager.create({
        type: 'particle',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.4 + Math.random() * 0.4,
        color,
        size: 3 + Math.random() * 4,
      });
      p.update = (dt) => this._updateParticle(p, manager, dt);
    }
  }

  static _updateParticle(p, manager, dt) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      manager.remove(p.id);
    }
  }
}

export default CollisionSystem;
