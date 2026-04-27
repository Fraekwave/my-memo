/**
 * useHistoricalPrices — fetch daily close prices for a list of tickers
 * from `fromDate` to today, via the `fetch-historical-prices` edge
 * function. Module-level cache keyed by `${ticker}|${fromDate}` survives
 * component unmount/remount (mode switches).
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export type PriceByTicker = Record<string, Record<string, number>>;

interface FetchResponse {
  prices: PriceByTicker;
  failures: string[];
}

// Module-level cache keyed by `${ticker}|${fromDate}` → map of date→price.
// Hydrated from localStorage on import, persisted on every successful write,
// so the chart can paint instantly even after a fresh page load.
const moduleCache = new Map<string, Record<string, number>>();
// Client-side time (ms) when we last received a response for this key, so
// the UI can show a "최종 업데이트 X분 전" label. Since the edge function
// enforces a 2-min TTL on today's row, this is accurate within ±TTL.
const fetchedAtCache = new Map<string, number>();

const STORAGE_KEY = 'mamavault.historicalPrices.v1';
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // discard entries older than 48h

interface PersistedEntry {
  prices: Record<string, number>;
  fetchedAt: number;
}

(function hydrateFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PersistedEntry>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.fetchedAt !== 'number' || !entry.prices) continue;
      if (now - entry.fetchedAt > MAX_AGE_MS) continue;
      moduleCache.set(key, entry.prices);
      fetchedAtCache.set(key, entry.fetchedAt);
    }
  } catch {
    // Corrupt JSON or quota error — start clean, no crash.
  }
})();

function persistToStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const out: Record<string, PersistedEntry> = {};
    for (const [key, prices] of moduleCache) {
      const fetchedAt = fetchedAtCache.get(key);
      if (fetchedAt == null) continue;
      out[key] = { prices, fetchedAt };
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    // Quota exceeded or storage disabled — fall back to in-memory only.
  }
}

export function useHistoricalPrices(
  tickers: string[],
  fromDate: string | null,
) {
  // Stable sorted key so identical inputs reuse the same effect
  const tickersKey = tickers.slice().sort().join(',');

  // Hydrate state synchronously from the (possibly localStorage-warmed)
  // module cache so the chart can paint on the very first render.
  const initial = (() => {
    if (!fromDate || tickers.length === 0) {
      return { prices: {} as PriceByTicker, oldest: null as number | null };
    }
    const out: PriceByTicker = {};
    let oldest: number | null = null;
    for (const t of tickers) {
      const hit = moduleCache.get(`${t}|${fromDate}`);
      if (hit) out[t] = hit;
      const ts = fetchedAtCache.get(`${t}|${fromDate}`);
      if (ts != null && (oldest === null || ts < oldest)) oldest = ts;
    }
    return { prices: out, oldest };
  })();

  const [prices, setPrices] = useState<PriceByTicker>(initial.prices);
  const [failures, setFailures] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(initial.oldest);
  const inflightRef = useRef<string | null>(null); // dedup overlapping fetches

  useEffect(() => {
    if (!fromDate || tickers.length === 0) {
      setPrices({});
      setFailures([]);
      setRefreshedAt(null);
      return;
    }

    // Hydrate from cache first
    const fromCache: PriceByTicker = {};
    let allCached = true;
    let oldestFetchedAt: number | null = null;
    for (const t of tickers) {
      const hit = moduleCache.get(`${t}|${fromDate}`);
      if (hit) fromCache[t] = hit;
      else allCached = false;
      const ts = fetchedAtCache.get(`${t}|${fromDate}`);
      if (ts != null && (oldestFetchedAt === null || ts < oldestFetchedAt)) {
        oldestFetchedAt = ts;
      }
    }
    if (Object.keys(fromCache).length > 0) setPrices(fromCache);
    if (allCached && oldestFetchedAt !== null) setRefreshedAt(oldestFetchedAt);

    if (allCached) return;

    // Otherwise fetch (deduped)
    const key = `${tickersKey}|${fromDate}`;
    if (inflightRef.current === key) return;
    inflightRef.current = key;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.functions.invoke<FetchResponse>(
          'fetch-historical-prices',
          { body: { tickers, fromDate } },
        );
        if (err) throw err;
        if (cancelled) return;
        const resp = data ?? { prices: {}, failures: tickers };
        const nowMs = Date.now();
        // Cache per-ticker + remember when it was fetched
        for (const [t, pm] of Object.entries(resp.prices)) {
          moduleCache.set(`${t}|${fromDate}`, pm);
          fetchedAtCache.set(`${t}|${fromDate}`, nowMs);
        }
        persistToStorage();
        setPrices(resp.prices);
        setFailures(resp.failures ?? []);
        setRefreshedAt(nowMs);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? 'historical price fetch failed');
        setFailures(tickers);
      } finally {
        if (!cancelled) setIsLoading(false);
        if (inflightRef.current === key) inflightRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, fromDate]);

  return { prices, failures, isLoading, error, refreshedAt };
}
