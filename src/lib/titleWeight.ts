/**
 * Visual Weight system for app title
 * Budget: 24.0 units — prevents layout overflow regardless of glyph width
 */

export const TITLE_WEIGHT_BUDGET = 24.0;

/** Hangul (Korean): 2.0 | Uppercase: 1.5 | Lowercase/Numbers: 1.0 | Symbols/Spaces: 0.8 */
function getCharWeight(c: string): number {
  if (c.length === 0) return 0;
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return 2.0; // Hangul syllables
  if (code >= 0x1100 && code <= 0x11ff) return 2.0; // Hangul Jamo
  if (code >= 0x3130 && code <= 0x318f) return 2.0; // Hangul Compatibility Jamo
  if (code >= 0x41 && code <= 0x5a) return 1.5; // A–Z
  if (code >= 0x61 && code <= 0x7a) return 1.0; // a–z
  if (code >= 0x30 && code <= 0x39) return 1.0; // 0–9
  return 0.8; // symbols, spaces, etc.
}

export function getTitleWeight(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    total += getCharWeight(s[i]);
  }
  return total;
}

export function fitsTitleBudget(s: string): boolean {
  return getTitleWeight(s) <= TITLE_WEIGHT_BUDGET;
}

/** Longest prefix that fits within budget. Used for paste/legacy data. */
export function truncateToTitleBudget(s: string): string {
  let total = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const w = getCharWeight(s[i]);
    if (total + w > TITLE_WEIGHT_BUDGET) break;
    total += w;
  }
  return s.slice(0, i);
}
