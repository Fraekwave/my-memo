import Hangul from 'hangul-js';

const MAX_CHARS = 30;

/**
 * Decompose text into Hangul jamo (초성, 중성, 종성).
 * Non-Hangul characters are kept as single units.
 * Limited to MAX_CHARS for performance.
 */
export function decomposeToJamo(text: string): string[] {
  if (!text?.trim()) return [];

  const jamo = Hangul.disassemble(text);
  return jamo.slice(0, MAX_CHARS);
}

/**
 * Decompose text so every visible character becomes at least one physics body.
 * - Hangul syllables (가, 나, etc.) → decomposed into jamo (ㄱㅏ, ㄴㅏ, etc.)
 * - All other characters (letters, numbers, symbols like ( ) + - etc.) → single-item group
 * Result: grouped array where each inner array maps to one rendered character.
 * Total physics bodies = sum of group lengths (matches visible character count for non-Hangul).
 */
export function decomposeToJamoGrouped(text: string): string[][] {
  if (!text?.trim()) return [];

  const result: string[][] = [];
  let totalCount = 0;

  for (let i = 0; i < text.length && totalCount < MAX_CHARS; i++) {
    const char = text[i];
    let group: string[];

    if (Hangul.isHangul(char)) {
      const decomposed = Hangul.disassemble(char, true) as string[][];
      group = decomposed.length > 0 ? decomposed[0] : [char];
    } else {
      group = [char];
    }

    const remaining = MAX_CHARS - totalCount;
    if (group.length <= remaining) {
      result.push([...group]);
      totalCount += group.length;
    } else {
      result.push(group.slice(0, remaining));
      totalCount = MAX_CHARS;
      break;
    }
  }

  return result;
}
