/**
 * Wave compositions (1-20) + procedural scaling formula.
 */
// Boss waves: every 5 waves (5 = Medusa, 10 = Hydra, alternating, scaling each appearance).
export const WAVE_DEFINITIONS = {
  1:  { enemies: { skeleton: 8 }, spawnInterval: 1.2 },
  2:  { enemies: { skeleton: 12 }, spawnInterval: 1.0 },
  3:  { enemies: { skeleton: 10, shade: 4 }, spawnInterval: 0.9 },
  4:  { enemies: { skeleton: 12, shade: 6, harpy: 3 }, spawnInterval: 0.85 },
  5:  { enemies: { skeleton: 10, shade: 8, minotaur: 2 }, spawnInterval: 0.8, boss: 'medusa' },
  6:  { enemies: { skeleton: 14, shade: 8, harpy: 4, minotaur: 3 }, spawnInterval: 0.75 },
  7:  { enemies: { skeleton: 14, shade: 10, harpy: 5, minotaur: 4 }, spawnInterval: 0.7 },
  8:  { enemies: { skeleton: 14, shade: 12, harpy: 6, minotaur: 4, cerberus: 2 }, spawnInterval: 0.65 },
  9:  { enemies: { skeleton: 16, shade: 12, harpy: 8, minotaur: 5, cerberus: 3 }, spawnInterval: 0.6 },
  10: { enemies: { skeleton: 18, shade: 16, harpy: 10, minotaur: 6, cerberus: 4 }, spawnInterval: 0.55, boss: 'hydra' },
  11: { enemies: { skeleton: 20, shade: 16, harpy: 12, minotaur: 7, cerberus: 5 }, spawnInterval: 0.55 },
  12: { enemies: { skeleton: 22, shade: 18, harpy: 12, minotaur: 8, cerberus: 6 }, spawnInterval: 0.5 },
  13: { enemies: { skeleton: 24, shade: 18, harpy: 14, minotaur: 9, cerberus: 7 }, spawnInterval: 0.48 },
  14: { enemies: { skeleton: 24, shade: 20, harpy: 14, minotaur: 10, cerberus: 8 }, spawnInterval: 0.45 },
  15: { enemies: { skeleton: 26, shade: 22, harpy: 16, minotaur: 12, cerberus: 9 }, spawnInterval: 0.42, boss: 'medusa' },
  16: { enemies: { skeleton: 28, shade: 24, harpy: 18, minotaur: 13, cerberus: 10 }, spawnInterval: 0.4 },
  17: { enemies: { skeleton: 30, shade: 24, harpy: 18, minotaur: 14, cerberus: 11 }, spawnInterval: 0.38 },
  18: { enemies: { skeleton: 30, shade: 26, harpy: 20, minotaur: 16, cerberus: 12 }, spawnInterval: 0.35 },
  19: { enemies: { skeleton: 32, shade: 28, harpy: 22, minotaur: 16, cerberus: 13 }, spawnInterval: 0.33 },
  20: { enemies: { skeleton: 34, shade: 30, harpy: 24, minotaur: 18, cerberus: 15 }, spawnInterval: 0.3, boss: 'hydra' },
};

export function getWaveConfig(waveNumber) {
  // Handcrafted waves 1-20
  if (waveNumber <= 20 && WAVE_DEFINITIONS[waveNumber]) {
    const def = WAVE_DEFINITIONS[waveNumber];
    return {
      enemies: { ...def.enemies },
      spawnInterval: def.spawnInterval,
      boss: def.boss || null,
    };
  }

  // Procedural scaling from wave 21+
  const base = WAVE_DEFINITIONS[20];
  const scale = Math.pow(1.08, waveNumber - 20);

  const enemies = {};
  for (const [type, count] of Object.entries(base.enemies)) {
    enemies[type] = Math.ceil(count * scale);
  }

  // Introduce new enemy types at thresholds
  if (waveNumber >= 25) {
    enemies.cerberus = (enemies.cerberus || 0) + Math.floor((waveNumber - 20) / 3);
  }
  if (waveNumber >= 30) {
    enemies.minotaur = (enemies.minotaur || 0) + Math.floor((waveNumber - 20) / 4);
  }

  // Boss every 5 waves (alternating Medusa / Hydra, scaled by WaveSystem)
  let boss = null;
  if (waveNumber % 5 === 0 && waveNumber > 0) {
    boss = waveNumber % 10 === 0 ? 'hydra' : 'medusa';
  }

  // Clamp max enemies per wave to prevent performance death
  const total = Object.values(enemies).reduce((a, b) => a + b, 0);
  const maxPerWave = 100;
  if (total > maxPerWave) {
    const factor = maxPerWave / total;
    for (const type of Object.keys(enemies)) {
      enemies[type] = Math.max(1, Math.floor(enemies[type] * factor));
    }
  }

  return {
    enemies,
    spawnInterval: Math.max(0.15, 0.30 - (waveNumber - 20) * 0.008),
    boss,
  };
}
