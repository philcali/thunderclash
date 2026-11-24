// LevelSystem — XP from kills -> levels. Each level-up queues a blessing pick.
class LevelSystem {
  constructor() {
    this.level = 1;
    this.xp = 0;       // progress into current level
    this.pending = 0;  // level-ups awaiting a blessing pick (may stack)
  }

  // XP needed to advance from level n to n+1 (linear ramp)
  static xpForLevel(n) {
    return 10 + 6 * (n - 1);
  }

  get progress() {
    return Math.min(1, this.xp / LevelSystem.xpForLevel(this.level));
  }

  addXp(amount) {
    this.xp += amount;
    let guard = 0;
    while (this.xp >= LevelSystem.xpForLevel(this.level) && guard++ < 200) {
      this.xp -= LevelSystem.xpForLevel(this.level);
      this.level += 1;
      this.pending += 1;
    }
  }
}

export default LevelSystem;
