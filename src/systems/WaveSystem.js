/**
 * WaveSystem — wave composition, spawn scheduling, difficulty scaling.
 */
import { ENEMY_TYPES } from '../data/enemies.js';
import { getWaveConfig } from '../data/levels.js';
import Haptics from '../game/Haptics.js';

class WaveSystem {
  constructor(entityManager, game) {
    this.manager = entityManager;
    this.game = game;
    this.currentWave = 0;
    this.enemiesRemaining = 0;
    this.spawnTimer = 0;
    this.spawnQueue = [];
    this.waveDelay = 3;
    this.betweenWaves = true;
    this.bossType = null;   // pending boss for this wave (spawned after a short telegraph)
    this.bossTimer = 0;
    this.banner = null;     // { text, timer } — boss announcement / wave banner
  }

  startWave() {
    this.currentWave++;
    const config = getWaveConfig(this.currentWave);
    this.spawnQueue = [];

    // Add regular enemies (boss is handled separately so it isn't shuffled in)
    for (const [type, count] of Object.entries(config.enemies)) {
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push(type);
      }
    }

    // Shuffle spawn queue
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }

    // Boss wave: announce + spawn first so it's the centerpiece
    if (config.boss) {
      const def = ENEMY_TYPES[config.boss];
      this.bossType = config.boss;
      this.bossTimer = 1.0; // short telegraph before the boss appears
      this.banner = { text: `${def.name.toUpperCase()} APPROACHES`, timer: 3.0 };
      Haptics.boss();
    }

    this.enemiesRemaining = this.spawnQueue.length + (config.boss ? 1 : 0);
    this.spawnTimer = 0;
    this.betweenWaves = false;
  }

  update(dt) {
    if (this.banner) {
      this.banner.timer -= dt;
      if (this.banner.timer <= 0) this.banner = null;
    }

    if (this.betweenWaves) {
      // Breather between waves — the next wave auto-starts after the delay.
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.betweenWaves = false;
        this.startWave();
      }
      return;
    }

    // Spawn the boss after its telegraph delay
    if (this.bossType) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this._spawnBoss(this.bossType);
        this.bossType = null;
      }
    }

    // Always tick the spawn timer so the wave-end path can be reached
    this.spawnTimer -= dt;

    if (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
      this._spawnNextEnemy();
      this.spawnTimer = this._getSpawnInterval();
    }

    // Wave ends when all enemies spawned AND all are dead
    if (this.spawnQueue.length === 0 && !this.bossType && this.enemiesRemaining <= 0) {
      if (!this.betweenWaves) Haptics.wave();
      this.betweenWaves = true;
      this.waveDelay = 3;
    }
  }

  _spawnNextEnemy() {
    const type = this.spawnQueue.shift();
    const angle = Math.random() * Math.PI * 2;
    const dist = 500; // spawn distance from player
    this.spawnEnemyAt(
      type,
      this.game.player.x + Math.cos(angle) * dist,
      this.game.player.y + Math.sin(angle) * dist
    );
  }

  /** Spawn an enemy of the given type at a world position. */
  spawnEnemyAt(type, x, y) {
    const def = ENEMY_TYPES[type];
    const enemy = this.manager.create({
      type: 'enemy',
      enemyType: type,
      def,
      x,
      y,
      radius: def.radius,
      health: def.health,
      maxHealth: def.health,
      damage: def.damage,
      pushbackX: 0,
      pushbackY: 0,
      color: def.color,
    });
    // Attach update that implements the enemy's behavior
    enemy.update = (dt) => this._updateEnemy(enemy, dt);
    return enemy;
  }

  /**
   * Bosses scale up each time they appear: +50% health/damage per
   * appearance (wave 5 → 1.0×, wave 10 → 1.5×, wave 15 → 2.0×, ...),
   * and they grow physically larger.
   */
  _spawnBoss(type) {
    const def = ENEMY_TYPES[type];
    const appearance = Math.max(1, Math.ceil(this.currentWave / 5));
    const scale = 1 + 0.5 * (appearance - 1);
    const radius = Math.min(44, def.radius * (1 + 0.15 * (scale - 1)));
    const angle = Math.random() * Math.PI * 2;
    const dist = 560; // spawn just off-screen on phones
    const x = this.game.player.x + Math.cos(angle) * dist;
    const y = this.game.player.y + Math.sin(angle) * dist;

    const scaledDef = { ...def, health: Math.round(def.health * scale), damage: Math.round(def.damage * scale) };
    const enemy = this.manager.create({
      type: 'enemy',
      enemyType: type,
      def: scaledDef,
      x,
      y,
      radius,
      health: scaledDef.health,
      maxHealth: scaledDef.health,
      damage: scaledDef.damage,
      pushbackX: 0,
      pushbackY: 0,
      color: def.color,
      isBoss: true,
      bossName: def.name,
    });
    enemy.update = (dt) => this._updateEnemy(enemy, dt);
    return enemy;
  }

  _updateEnemy(enemy, dt) {
    const def = enemy.def;
    const dx = this.game.player.x - enemy.x;
    const dy = this.game.player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Apply pushback decay
    enemy.x += enemy.pushbackX * dt;
    enemy.y += enemy.pushbackY * dt;
    enemy.pushbackX *= 0.9;
    enemy.pushbackY *= 0.9;

    // Stunned (e.g. Zeus Thunder Barrier): frozen in place
    if (enemy.stunTimer > 0) {
      enemy.stunTimer -= dt;
      return;
    }

    // Boss regen
    if (def.regenerates && def.regenRate) {
      enemy.health = Math.min(enemy.maxHealth, enemy.health + def.regenRate * dt);
    }

    // Behavior-based movement
    let speed = def.speed;
    if (def.behavior === 'chase') {
      enemy.x += (dx / dist) * speed * dt;
      enemy.y += (dy / dist) * speed * dt;
    } else if (def.behavior === 'phase') {
      // Shade: phases in and out, faster when phasing
      const phase = Math.sin(Date.now() / 500);
      const phaseSpeed = phase > 0 ? speed * 1.5 : speed * 0.3;
      enemy.x += (dx / dist) * phaseSpeed * dt;
      enemy.y += (dy / dist) * phaseSpeed * dt;
    } else if (def.behavior === 'fly') {
      // Harpy: flies directly, avoids collisions handled elsewhere
      enemy.x += (dx / dist) * speed * dt;
      enemy.y += (dy / dist) * speed * dt;
    } else if (def.behavior === 'boss') {
      // Boss: chases slowly
      enemy.x += (dx / dist) * speed * dt;
      enemy.y += (dy / dist) * speed * dt;
    }
  }

  _getSpawnInterval() {
    const config = getWaveConfig(this.currentWave);
    return config.spawnInterval;
  }

  onEnemyKilled(enemy) {
    this.enemiesRemaining--;
    this.game.score.addKill(enemy && enemy.def);

    // XP drops as a small orb that flies to the player
    if (enemy && this.game.levelSystem) {
      this._spawnXpOrb(enemy.x, enemy.y, (enemy.def && enemy.def.xp) || 1);
    }

    // Cerberus: on death it splits into two fast hellhounds
    if (enemy && enemy.def && enemy.def.onDeath === 'spawn_dogs') {
      this._spawnHellhounds(enemy.x, enemy.y);
    }
  }

  /** XP orb: drifts, then accelerates toward the player when near. */
  _spawnXpOrb(x, y, value) {
    const em = this.manager;
    const g = this.game;
    const orbs = em.getByType('xp');
    if (orbs.length >= 40) {
      // Cap active orbs: merge into the nearest one to keep the grid light
      let best = orbs[0], bd = Infinity;
      for (const o of orbs) {
        const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
        if (d < bd) { bd = d; best = o; }
      }
      best.value += value;
      return;
    }
    const orb = em.create({ type: 'xp', x, y, value, r: Math.min(7, 3 + value * 0.25) });
    orb.update = (dt) => {
      const p = g.player;
      if (!p) return;
      const dx = p.x - orb.x, dy = p.y - orb.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 90) {
        orb.vel = Math.min(620, (orb.vel || 0) + 2600 * dt);
        orb.x += (dx / d) * orb.vel * dt;
        orb.y += (dy / d) * orb.vel * dt;
      }
      if (d < 16) {
        g.levelSystem.addXp(orb.value);
        em.remove(orb.id);
      }
    };
  }

  _spawnHellhounds(x, y) {
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const off = 14 + Math.random() * 10;
      this.spawnEnemyAt(
        'hellhound',
        x + Math.cos(angle) * off,
        y + Math.sin(angle) * off
      );
    }
    // Keep the wave alive until the spawned pack is cleared too
    this.enemiesRemaining += 2;
    if (this.betweenWaves) {
      this.betweenWaves = false;
      this.waveDelay = 3;
    }
  }
}

export default WaveSystem;
