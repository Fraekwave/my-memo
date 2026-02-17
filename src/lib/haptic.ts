/**
 * Haptic feedback utility
 *
 * Uses navigator.vibrate() — supported on Android, not on iOS Safari.
 * Fails silently when unsupported. Returns true if vibration was triggered.
 */
const DEFAULT_PATTERN = [50]; // ms — short tactile punch

export function tryHaptic(pattern: number[] = DEFAULT_PATTERN): boolean {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return false;
  }
  try {
    navigator.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}
