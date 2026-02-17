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

/**
 * Decompose text into jamo grouped by syllable/character.
 * Each inner array contains jamo for one rendered character.
 * Used for coordinate mapping so jamo start at their original positions.
 */
export function decomposeToJamoGrouped(text: string): string[][] {
  if (!text?.trim()) return [];

  const grouped = Hangul.disassemble(text, true) as string[][];
  const flat: string[] = [];
  const result: string[][] = [];

  for (const group of grouped) {
    if (flat.length + group.length <= MAX_JAMO) {
      result.push([...group]);
      flat.push(...group);
    } else {
      const remaining = MAX_JAMO - flat.length;
      if (remaining > 0) {
        result.push(group.slice(0, remaining));
      }
      break;
    }
  }
  return result;
}
