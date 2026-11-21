/**
 * Haptics — light vibration feedback on mobile (no-op elsewhere).
 */
function vibrate(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern); } catch (e) { /* ignored */ }
  }
}

export default {
  tap:      () => vibrate(8),
  hit:      () => vibrate([30, 30, 30]),
  wave:     () => vibrate(18),
  boss:     () => vibrate([60, 80, 60, 80, 140]),
  death:    () => vibrate([70, 50, 70, 50, 120]),
  ability:  () => vibrate([25, 20, 40]),
};
