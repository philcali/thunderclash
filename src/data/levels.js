/**
 * Wave scaling — geometric ramp ("Ramp A"):
 *   total = min(CAP, round(12 × 1.24^(wave−1)))
 *
 *   W1: 12   W5: 28    W10: 85
 *   W15: 250  W20: 740  W23+: 1200 (cap)
 *
 * Type mix is weight-based per type (fractions of the wave total),
 * with each type unlocking at its `from` wave.
 * Boss waves: every 5 (Hydra on wave 10/20/..., Medusa otherwise).
 */
const BASE_TOTAL = 12;
const GROWTH = 1.24;
const CAP = 1200;

const TYPE_TABLE = [
  { type: 'skeleton', from: 1, weight: 1.00 },
  { type: 'shade',    from: 3, weight: 0.75 },
  { type: 'harpy',    from: 4, weight: 0.60 },
  { type: 'minotaur', from: 5, weight: 0.50 },
  { type: 'cerberus', from: 8, weight: 0.35 },
];

export function totalForWave(wave) {
  return Math.min(CAP, Math.round(BASE_TOTAL * Math.pow(GROWTH, wave - 1)));
}

function spawnIntervalForWave(wave) {
  return Math.max(0.15, 1.15 * Math.pow(0.94, wave - 1));
}

export function getWaveConfig(waveNumber) {
  const wave = Math.max(1, waveNumber);
  const total = totalForWave(wave);

  const active = TYPE_TABLE.filter(t => wave >= t.from);
  const weightSum = active.reduce((a, t) => a + t.weight, 0);

  const enemies = {};
  let allocated = 0;
  for (const t of active) {
    const count = Math.max(1, Math.round((total * t.weight) / weightSum));
    enemies[t.type] = count;
    allocated += count;
  }
  // Absorb rounding into the most common type
  const diff = total - allocated;
  if (diff !== 0) enemies[active[0].type] += diff;

  let boss = null;
  if (wave % 5 === 0) {
    boss = wave % 10 === 0 ? 'hydra' : 'medusa';
  }

  return {
    enemies,
    spawnInterval: spawnIntervalForWave(wave),
    boss,
  };
}
