/**
 * Player entity — movement, health, shield, invincibility, god identity.
 */
import Haptics from '../game/Haptics.js';

class Player {
  constructor(god) {
    this.god = god;
    this.x = 0;
    this.y = 0;
    this.radius = 14;
    this.speed = 180;
    this.maxHealth = 100;
    this.health = 100;
    this.invincible = false;
    this.invincibleTimer = 0;
    this.shield = 0;
    this.shieldTimer = 0;
    this.healthRegen = 0;
    // Weapon stats (merged with weapon defaults at game start)
    this.weaponStats = {};
  }

  update(dt) {
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) this.invincible = false;
    }

    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) this.shield = 0;
    }

    // Health regen
    if (this.healthRegen > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.healthRegen * dt);
    }
  }

  takeDamage(amount) {
    // Guard: never let a bad value (undefined/NaN) poison health —
    // `NaN <= 0` is false, which would make the player immortal.
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (this.invincible) return;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) {
        this.invincible = true;
        this.invincibleTimer = 0.5;
        Haptics.tap();
        return;
      }
    }
    this.health -= amount;
    this.invincible = true;
    this.invincibleTimer = 0.5;
    Haptics.hit();
  }
}

export default Player;
