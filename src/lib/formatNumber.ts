/**
 * Number formatting helpers for Portfolio mode.
 * Korean-locale KRW display + fractional share formatting.
 */

/** "1,234,567원" */
export function formatKrw(amount: number, withSuffix = true): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('ko-KR');
  return withSuffix ? `${formatted}원` : formatted;
}

/**
 * Format fractional shares for crypto display.
 * Uses `maxDecimals` (default 8, BTC standard) and trims trailing zeros.
 */
export function formatShares(shares: number, maxDecimals = 8): string {
  if (!Number.isFinite(shares)) return '0';
  if (shares === 0) return '0';
  // For large values use standard locale formatting with up to 2 decimals.
  if (Math.abs(shares) >= 1) {
    return shares.toLocaleString('ko-KR', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  // For small values (fractional BTC), show up to maxDecimals, trimming trailing zeros.
  const fixed = shares.toFixed(maxDecimals);
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed;
}

/** "+12.3%" or "-5.7%" */
export function formatSignedPct(pct: number, decimals = 1): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}
