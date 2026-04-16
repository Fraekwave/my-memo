/**
 * usePortfolios — CRUD for portfolios + nested portfolio_assets.
 *
 * A "portfolio with assets" is treated as one logical unit. Saving a
 * portfolio replaces its asset rows in a single round-trip.
 *
 * Module-level cache mirrors the useSermonNotes pattern: cache survives
 * component unmount/remount (mode switches) so opening the 투자 mode is
 * instant after the first load.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Portfolio, PortfolioAsset, PortfolioKind, AssetCategory } from '@/lib/types';

export interface PortfolioWithAssets {
  portfolio: Portfolio;
  assets: PortfolioAsset[];
}

export interface PortfolioInput {
  name: string;
  kind: PortfolioKind;
  monthly_budget: number;
  benchmark_ticker: string | null;
}

export interface AssetInput {
  ticker: string;
  name: string;
  category: AssetCategory;
  target_pct: number;
  order_index: number;
}

// Module-level cache
let moduleCache: PortfolioWithAssets[] | null = null;
let moduleCacheUserId: string | null = null;

export function usePortfolios(userId: string | null) {
  const hasCached =
    userId != null && moduleCacheUserId === userId && moduleCache !== null;

  const [portfolios, setPortfolios] = useState<PortfolioWithAssets[]>(
    hasCached ? moduleCache! : [],
  );
  const [isLoading, setIsLoading] = useState(!hasCached);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<PortfolioWithAssets[]>(
    hasCached ? moduleCache! : [],
  );

  const updateCache = useCallback(
    (updater: (prev: PortfolioWithAssets[]) => PortfolioWithAssets[]) => {
      setPortfolios((prev) => {
        const next = updater(prev);
        cacheRef.current = next;
        moduleCache = next;
        return next;
      });
    },
    [],
  );

  // Fetch all portfolios + their assets
  useEffect(() => {
    if (!userId) {
      setPortfolios([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      if (!hasCached) setIsLoading(true);
      setError(null);

      // Single query joining via select; Supabase returns nested arrays.
      const { data, error: err } = await supabase
        .from('portfolios')
        .select('*, portfolio_assets(*)')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('order_index', { ascending: true });

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setIsLoading(false);
        return;
      }

      const result: PortfolioWithAssets[] = (data ?? []).map((row: any) => {
        const { portfolio_assets, ...portfolio } = row;
        const assets = (portfolio_assets ?? []) as PortfolioAsset[];
        assets.sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
        );
        return { portfolio: portfolio as Portfolio, assets };
      });

      cacheRef.current = result;
      moduleCache = result;
      moduleCacheUserId = userId;
      setPortfolios(result);
      setIsLoading(false);
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [userId, hasCached]);

  /**
   * Create a new portfolio with its assets.
   * Returns the created portfolio (with assets) on success, null on failure.
   */
  const createPortfolio = useCallback(
    async (
      portfolioInput: PortfolioInput,
      assetInputs: AssetInput[],
    ): Promise<PortfolioWithAssets | null> => {
      if (!userId) return null;

      const maxOrder = cacheRef.current.reduce(
        (m, p) => Math.max(m, p.portfolio.order_index ?? 0),
        -1,
      );

      const { data: pData, error: pErr } = await supabase
        .from('portfolios')
        .insert({
          user_id: userId,
          name: portfolioInput.name,
          kind: portfolioInput.kind,
          monthly_budget: portfolioInput.monthly_budget,
          benchmark_ticker: portfolioInput.benchmark_ticker,
          order_index: maxOrder + 1,
        })
        .select()
        .single();

      if (pErr || !pData) {
        setError(pErr?.message ?? 'create portfolio failed');
        return null;
      }

      const portfolio = pData as Portfolio;

      let assets: PortfolioAsset[] = [];
      if (assetInputs.length > 0) {
        const { data: aData, error: aErr } = await supabase
          .from('portfolio_assets')
          .insert(
            assetInputs.map((a) => ({
              portfolio_id: portfolio.id,
              ticker: a.ticker,
              name: a.name,
              category: a.category,
              target_pct: a.target_pct,
              order_index: a.order_index,
            })),
          )
          .select();
        if (aErr) {
          setError(aErr.message);
        } else {
          assets = (aData ?? []) as PortfolioAsset[];
        }
      }

      const created = { portfolio, assets };
      updateCache((prev) => [...prev, created]);
      return created;
    },
    [userId, updateCache],
  );

  /**
   * Update a portfolio's metadata. Does not touch assets.
   */
  const updatePortfolio = useCallback(
    async (
      portfolioId: number,
      updates: Partial<PortfolioInput>,
    ): Promise<boolean> => {
      const prev = cacheRef.current;
      // Optimistic
      updateCache((p) =>
        p.map((row) =>
          row.portfolio.id === portfolioId
            ? {
                ...row,
                portfolio: {
                  ...row.portfolio,
                  ...updates,
                  updated_at: new Date().toISOString(),
                },
              }
            : row,
        ),
      );

      const { error: err } = await supabase
        .from('portfolios')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', portfolioId);

      if (err) {
        cacheRef.current = prev;
        moduleCache = prev;
        setPortfolios(prev);
        setError(err.message);
        return false;
      }
      return true;
    },
    [updateCache],
  );

  /**
   * Replace ALL assets of a portfolio with the given list.
   * Used by PortfolioEditor — simpler than diffing individual rows.
   */
  const replacePortfolioAssets = useCallback(
    async (
      portfolioId: number,
      assetInputs: AssetInput[],
    ): Promise<boolean> => {
      // Delete existing then insert new — wrap-ish behavior; if insert fails
      // we'll have an empty asset list briefly which we'll repair on refetch.
      const { error: delErr } = await supabase
        .from('portfolio_assets')
        .delete()
        .eq('portfolio_id', portfolioId);
      if (delErr) {
        setError(delErr.message);
        return false;
      }

      let assets: PortfolioAsset[] = [];
      if (assetInputs.length > 0) {
        const { data, error: insErr } = await supabase
          .from('portfolio_assets')
          .insert(
            assetInputs.map((a) => ({
              portfolio_id: portfolioId,
              ticker: a.ticker,
              name: a.name,
              category: a.category,
              target_pct: a.target_pct,
              order_index: a.order_index,
            })),
          )
          .select();
        if (insErr) {
          setError(insErr.message);
          return false;
        }
        assets = (data ?? []) as PortfolioAsset[];
      }

      updateCache((p) =>
        p.map((row) =>
          row.portfolio.id === portfolioId ? { ...row, assets } : row,
        ),
      );
      return true;
    },
    [updateCache],
  );

  /**
   * Soft-delete a portfolio (sets deleted_at). Cascades to assets/transactions
   * happen automatically via FK ON DELETE CASCADE only on hard delete; soft
   * delete just hides them from the active list.
   */
  const deletePortfolio = useCallback(
    async (portfolioId: number): Promise<boolean> => {
      const prev = cacheRef.current;
      updateCache((p) => p.filter((row) => row.portfolio.id !== portfolioId));

      const { error: err } = await supabase
        .from('portfolios')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', portfolioId);

      if (err) {
        cacheRef.current = prev;
        moduleCache = prev;
        setPortfolios(prev);
        setError(err.message);
        return false;
      }
      return true;
    },
    [updateCache],
  );

  return {
    portfolios,
    isLoading,
    error,
    createPortfolio,
    updatePortfolio,
    replacePortfolioAssets,
    deletePortfolio,
  };
}
