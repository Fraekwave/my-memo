/**
 * useAssetPrices — fetches today's prices for a list of tickers via the
 * `fetch-asset-prices` edge function.
 *
 * Strategy:
 *  - Module-level cache (price by ticker) survives mode switches.
 *  - Manual prices entered by the user via PriceManualEntry persist via the
 *    same `price_snapshots` table (source='manual'), which the edge function
 *    will return on the next refresh.
 *  - The hook exposes the failures list so callers can render a manual-entry
 *    modal when the upstream API can't satisfy a ticker.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export type PriceSourceTag = 'naver' | 'krx' | 'upbit' | 'cache' | 'manual';

export interface PriceMap {
  [ticker: string]: number;
}

export interface SourceMap {
  [ticker: string]: PriceSourceTag;
}

interface FetchResponse {
  prices: PriceMap;
  failures: string[];
  sources: { [ticker: string]: PriceSourceTag };
}

// Module-level cache survives unmount/remount (mode switching).
const moduleCache = new Map<string, { price: number; source: PriceSourceTag; fetchedAt: number }>();

const STALE_MS_MARKET_OPEN = 10 * 60 * 1000; // 10 min during market hours
const STALE_MS_MARKET_CLOSED = 12 * 60 * 60 * 1000; // 12 h outside

function isMarketOpen(now: Date = new Date()): boolean {
  // Korean market hours: Mon-Fri 09:00-15:30 KST
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
}

function todayKstDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function useAssetPrices(tickers: string[]) {
  const [prices, setPrices] = useState<PriceMap>(() => {
    const initial: PriceMap = {};
    for (const t of tickers) {
      const hit = moduleCache.get(t);
      if (hit) initial[t] = hit.price;
    }
    return initial;
  });
  const [sources, setSources] = useState<SourceMap>({});
  const [failures, setFailures] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable comparison key for ticker list
  const tickersKey = tickers.slice().sort().join(',');
  const tickersKeyRef = useRef(tickersKey);
  tickersKeyRef.current = tickersKey;

  const refresh = useCallback(async (force = false) => {
    if (tickers.length === 0) {
      setPrices({});
      setSources({});
      setFailures([]);
      return;
    }

    // Filter to tickers that need a refresh
    const now = Date.now();
    const staleThreshold = isMarketOpen() ? STALE_MS_MARKET_OPEN : STALE_MS_MARKET_CLOSED;
    const needFetch = tickers.filter((t) => {
      if (force) return true;
      const hit = moduleCache.get(t);
      if (!hit) return true;
      return now - hit.fetchedAt > staleThreshold;
    });

    // If everything is fresh in cache, just hydrate from cache
    if (needFetch.length === 0) {
      const fromCache: PriceMap = {};
      const cachedSources: SourceMap = {};
      for (const t of tickers) {
        const hit = moduleCache.get(t);
        if (hit) {
          fromCache[t] = hit.price;
          cachedSources[t] = hit.source;
        }
      }
      setPrices(fromCache);
      setSources(cachedSources);
      setFailures([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<FetchResponse>(
        'fetch-asset-prices',
        { body: { tickers: needFetch } },
      );

      if (invokeErr) throw invokeErr;
      const response = data ?? { prices: {}, failures: needFetch, sources: {} };

      // Merge into module cache
      for (const [ticker, price] of Object.entries(response.prices)) {
        const source = response.sources[ticker] ?? 'cache';
        moduleCache.set(ticker, { price, source, fetchedAt: now });
      }

      // Combine fetched + previously-cached (for tickers not in needFetch)
      const merged: PriceMap = {};
      const mergedSources: SourceMap = {};
      for (const t of tickers) {
        const hit = moduleCache.get(t);
        if (hit) {
          merged[t] = hit.price;
          mergedSources[t] = hit.source;
        }
      }

      setPrices(merged);
      setSources(mergedSources);
      setFailures(response.failures ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'price fetch failed');
      setFailures(needFetch); // treat all as failed → manual fallback
    } finally {
      setIsLoading(false);
    }
  }, [tickers, tickersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  /**
   * Save a manually-entered price. Writes to `price_snapshots` with
   * source='manual', updates module cache, removes ticker from failures.
   */
  const setManualPrice = useCallback(async (ticker: string, price: number): Promise<boolean> => {
    const trade_date = todayKstDate();
    const { error: err } = await supabase.from('price_snapshots').upsert(
      {
        ticker,
        trade_date,
        price,
        source: 'manual',
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'ticker,trade_date' },
    );

    if (err) {
      setError(err.message);
      return false;
    }

    moduleCache.set(ticker, {
      price,
      source: 'manual',
      fetchedAt: Date.now(),
    });

    setPrices((prev) => ({ ...prev, [ticker]: price }));
    setSources((prev) => ({ ...prev, [ticker]: 'manual' }));
    setFailures((prev) => prev.filter((t) => t !== ticker));
    return true;
  }, []);

  return {
    prices,
    sources,
    failures,
    isLoading,
    error,
    refresh,
    setManualPrice,
  };
}
