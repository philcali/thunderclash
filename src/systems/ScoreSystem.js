/**
 * ScoreSystem — survival time, kills, high score (localStorage).
 */
class ScoreSystem {
  constructor() {
    this.total = 0;
    this.elapsed = 0;
    this.kills = 0;
    this.killScore = 0;
    this.highScore = parseInt(localStorage.getItem('thunderclash_highscore')) || 0;
  }

  update(dt) {
    this.elapsed += dt;
    this.total = Math.floor(this.elapsed * 10) + this.killScore;
  }

  /** Score by enemy type — mediums and bosses are worth far more than skeletons. */
  addKill(def) {
    this.kills += 1;
    this.killScore += (def && def.score) || 10;
  }
}

export default ScoreSystem;
