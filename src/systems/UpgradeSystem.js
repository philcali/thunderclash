/**
 * UpgradeSystem — blessing pool, option generation, selection.
 */
import { UPGRADES } from '../data/blessings.js';
import { GODS } from '../data/gods.js';

class UpgradeSystem {
  constructor() {
    this.selectedUpgrades = [];
  }

  generateOptions(player, previousIds) {
    // Determine which gods are still unlockable
    const unlocked = JSON.parse(localStorage.getItem('thunderclash_unlocked') || '["zeus"]');
    const availableGods = GODS.filter(g => g.id !== 'zeus' && !unlocked.includes(g.id));
    const hasNewGod = availableGods.length > 0;

    // Filter available upgrades
    const available = UPGRADES.filter(u => {
      if (u.id === 'new_god' && !hasNewGod) return false;
      if (!u.stackable) return !previousIds.includes(u.id);
      const count = this.selectedUpgrades.filter(up => up.id === u.id).length;
      return count < (u.maxStacks || 1);
    });

    // Weighted selection favoring diversity
    const options = [];
    const pool = [...available];
    const usedIds = new Set(this.selectedUpgrades.map(u => u.id));

    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const weights = pool.map(u => usedIds.has(u.id) ? 1 : 2);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalWeight;
      let idx = 0;
      for (; idx < weights.length; idx++) {
        r -= weights[idx];
        if (r <= 0) break;
      }
      options.push(pool.splice(idx, 1)[0]);
      usedIds.add(options[options.length - 1].id);
    }

    return options;
  }

  selectUpgrade(upgradeId, player, game) {
    const upgrade = UPGRADES.find(u => u.id === upgradeId);
    if (!upgrade) return null;

    // Handle special "New God" blessing
    if (upgradeId === 'new_god') {
      const unlocked = JSON.parse(localStorage.getItem('thunderclash_unlocked') || '["zeus"]');
      const available = GODS.filter(g => g.id !== 'zeus' && !unlocked.includes(g.id));
      if (available.length > 0) {
        const god = available[0];
        unlocked.push(god.id);
        localStorage.setItem('thunderclash_unlocked', JSON.stringify(unlocked));
        // Set player to new god
        player.god = god;
        player.pendingGodSwitch = god;
      }
    }

    upgrade.apply(player, game);
    this.selectedUpgrades.push(upgrade);
    return upgrade;
  }
}

export default UpgradeSystem;
