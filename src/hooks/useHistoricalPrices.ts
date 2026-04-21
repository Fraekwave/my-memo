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
const moduleCache = new Map<string, Record<string, number>>();

export function useHistoricalPrices(
  tickers: string[],
  fromDate: string | null,
) {
  // Stable sorted key so identical inputs reuse the same effect
  const tickersKey = tickers.slice().sort().join(',');

  const [prices, setPrices] = useState<PriceByTicker>({});
  const [failures, setFailures] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<string | null>(null); // dedup overlapping fetches

  useEffect(() => {
    if (!fromDate || tickers.length === 0) {
      setPrices({});
      setFailures([]);
      return;
    }

    // Hydrate from cache first
    const fromCache: PriceByTicker = {};
    let allCached = true;
    for (const t of tickers) {
      const hit = moduleCache.get(`${t}|${fromDate}`);
      if (hit) fromCache[t] = hit;
      else allCached = false;
    }
    if (Object.keys(fromCache).length > 0) setPrices(fromCache);

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
        // Cache per-ticker
        for (const [t, pm] of Object.entries(resp.prices)) {
          moduleCache.set(`${t}|${fromDate}`, pm);
        }
        setPrices(resp.prices);
        setFailures(resp.failures ?? []);
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

  return { prices, failures, isLoading, error };
}
