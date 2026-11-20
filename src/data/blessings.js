/**
 * Blessing definitions — between-wave upgrades from the gods.
 */
export const UPGRADES = [
  {
    id: 'zeus_fury',
    name: "Zeus's Fury",
    description: '+20% damage, chain +1 target',
    icon: '⚡',
    color: '#ffd700',
    apply: (player) => {
      player.weaponStats.damage = (player.weaponStats.damage || 0) * 1.2;
      player.weaponStats.chainCount = (player.weaponStats.chainCount || 0) + 1;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'poseidon_tide',
    name: "Poseidon's Tide",
    description: '+15% water speed, +20 splash radius',
    icon: '🔱',
    color: '#00bcd4',
    apply: (player) => {
      player.weaponStats.projectileSpeed = (player.weaponStats.projectileSpeed || 0) * 1.15;
      player.weaponStats.splashRadius = (player.weaponStats.splashRadius || 0) + 20;
    },
    stackable: true,
    maxStacks: 8,
  },
  {
    id: 'apollo_light',
    name: "Apollo's Light",
    description: 'Heal 25% HP, gain shield',
    icon: '☀',
    color: '#ffeb3b',
    apply: (player) => {
      player.health = Math.min(player.maxHealth, player.health + player.maxHealth * 0.25);
      player.shield += 30;
      player.shieldTimer += 30;
    },
    stackable: false,
  },
  {
    id: 'hermes_swiftness',
    name: "Hermes' Swiftness",
    description: '+10% movement speed',
    icon: '👟',
    color: '#8bc34a',
    apply: (player) => {
      player.speed *= 1.10;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'athena_wisdom',
    name: "Athena's Wisdom",
    description: '+1 projectile pierce',
    icon: '🦉',
    color: '#42a5f5',
    apply: (player) => {
      player.weaponStats.pierce = (player.weaponStats.pierce || 0) + 1;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'ares_rage',
    name: "Ares' Rage",
    description: '+25% attack damage',
    icon: '🔥',
    color: '#ef5350',
    apply: (player) => {
      player.weaponStats.damage = (player.weaponStats.damage || 0) * 1.25;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'artemis_haste',
    name: "Artemis' Haste",
    description: '+15% fire rate',
    icon: '🌙',
    color: '#ce93d8',
    apply: (player) => {
      player.weaponStats.fireRate = (player.weaponStats.fireRate || 0) * 0.85;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'hephaestus_forge',
    name: "Hephaestus' Forge",
    description: '+1 multi-shot',
    icon: '⚒',
    color: '#ff9800',
    apply: (player) => {
      player.weaponStats.count = (player.weaponStats.count || 1) + 1;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'demeter_bounty',
    name: "Demeter's Bounty",
    description: '+20 max HP, +0.5 regen/s',
    icon: '🌾',
    color: '#7cb342',
    apply: (player) => {
      player.maxHealth += 20;
      player.health += 20;
      player.healthRegen = (player.healthRegen || 0) + 0.5;
    },
    stackable: true,
    maxStacks: 10,
  },
  {
    id: 'new_god',
    name: 'New God',
    description: 'Unlock a new Olympian god',
    icon: '🏛',
    color: '#ffd700',
    apply: (player) => {
      // Handled separately in UpgradeSystem
    },
    stackable: false,
  },
];
