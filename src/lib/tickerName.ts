/**
 * Ticker name resolver — given a 6-digit Korean ETF/stock code or a
 * Korean Upbit market code (KRW-BTC), returns the official Korean name.
 *
 * Used by PortfolioEditor to auto-fill the asset name field after the
 * user types a ticker code, sparing them from typing the name by hand.
 *
 * Caching strategy: names never change, so we cache successful lookups
 * in localStorage forever. Failed lookups are NOT cached (so the user
 * can retry by typing again).
 */

import { supabase } from './supabase';

const STORAGE_KEY = 'mamavault.tickerNames.v1';

interface ResolveResponse {
  name: string | null;
  source: 'naver' | 'crypto' | null;
}

// In-memory cache, hydrated from localStorage on module init.
const memoryCache = new Map<string, string>();

(function hydrateFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) memoryCache.set(k, v);
    }
  } catch {
    // ignore corrupt JSON / quota errors
  }
})();

function persist() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of memoryCache) obj[k] = v;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

/**
 * Look up the name for a ticker. Returns the name string on success,
 * null on failure (unknown ticker / network error).
 *
 * Synchronous cache hits are still returned via Promise to keep the
 * caller code simple (always await).
 */
export async function resolveTickerName(ticker: string): Promise<string | null> {
  const t = ticker.trim();
  if (!t) return null;

  const cached = memoryCache.get(t);
  if (cached) return cached;

  // Only attempt lookup for known ticker shapes.
  if (!/^\d{6}$/.test(t) && !/^KRW-[A-Z0-9]+$/.test(t)) return null;

  try {
    const { data, error } = await supabase.functions.invoke<ResolveResponse>(
      'resolve-ticker-name',
      { body: { ticker: t } },
    );
    if (error) return null;
    const name = data?.name ?? null;
    if (name) {
      memoryCache.set(t, name);
      persist();
    }
    return name;
  } catch {
    return null;
  }
}
