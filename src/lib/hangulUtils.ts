import Hangul from 'hangul-js';

const MAX_JAMO = 20;

/**
 * Decompose text into Hangul jamo (초성, 중성, 종성).
 * Non-Hangul characters are kept as single units.
 * Limited to MAX_JAMO for performance.
 */
export function decomposeToJamo(text: string): string[] {
  if (!text?.trim()) return [];

  const jamo = Hangul.disassemble(text);
  return jamo.slice(0, MAX_JAMO);
}
