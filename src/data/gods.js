/**
 * God definitions — Zeus, Poseidon, Hades, Athena, Ares.
 */
export const GODS = [
  {
    id: 'zeus',
    name: 'Zeus',
    icon: '⚡',
    color: '#ffd700',
    weapon: 'lightning',
    description: 'King of the gods. Chains lightning between enemies.',
    unlockCondition: null,
  },
  {
    id: 'poseidon',
    name: 'Poseidon',
    icon: '🔱',
    color: '#00bcd4',
    weapon: 'trident',
    description: 'Lord of the seas. Sweeping water attacks with splash damage.',
    unlockCondition: 'waves_10',
  },
  {
    id: 'hades',
    name: 'Hades',
    icon: '☠',
    color: '#9c27b0',
    weapon: 'soulfire',
    description: 'Ruler of the underworld. Soul fire burns over time.',
    unlockCondition: 'waves_20',
  },
  {
    id: 'athena',
    name: 'Athena',
    icon: '🛡',
    color: '#42a5f5',
    weapon: 'spear',
    description: 'Goddess of wisdom. High-piercing divine spears.',
    unlockCondition: 'waves_30',
  },
  {
    id: 'ares',
    name: 'Ares',
    icon: '🗡',
    color: '#ef5350',
    weapon: 'hammer',
    description: 'God of war. Massive damage with devastating knockback.',
    unlockCondition: 'waves_50',
  },
];
