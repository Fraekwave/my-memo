/**
 * useTransactions — CRUD for `transactions` table, scoped to one portfolio.
 *
 * Module-level cache keyed by portfolioId so switching between portfolios
 * (or unmounting/remounting) doesn't re-hit Supabase unnecessarily.
 *
 * Includes a bulkInsert helper used by the CSV import wizard.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/lib/types';

export interface TransactionInput {
  ticker: string;
  trade_date: string;     // ISO YYYY-MM-DD
  shares: number;
  price: number;
  note?: string;
}

// Module-level cache: Map<portfolioId, Transaction[]>
const moduleCache = new Map<number, Transaction[]>();
let moduleCacheUserId: string | null = null;

function clearModuleCacheIfUserChanged(userId: string | null) {
  if (moduleCacheUserId !== userId) {
    moduleCache.clear();
    moduleCacheUserId = userId;
  }
}

export function useTransactions(
  userId: string | null,
  portfolioId: number | null,
) {
  clearModuleCacheIfUserChanged(userId);

  const cached = portfolioId != null ? moduleCache.get(portfolioId) : undefined;
  const [transactions, setTransactions] = useState<Transaction[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Transaction[]>(cached ?? []);

  const updateCache = useCallback(
    (updater: (prev: Transaction[]) => Transaction[]) => {
      setTransactions((prev) => {
        const next = updater(prev);
        cacheRef.current = next;
        if (portfolioId != null) moduleCache.set(portfolioId, next);
        return next;
      });
    },
    [portfolioId],
  );

  useEffect(() => {
    if (!userId || portfolioId == null) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      const hasCached = moduleCache.has(portfolioId!);
      if (!hasCached) setIsLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('portfolio_id', portfolioId)
        .order('trade_date', { ascending: false });

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as Transaction[];
      cacheRef.current = rows;
      moduleCache.set(portfolioId!, rows);
      setTransactions(rows);
      setIsLoading(false);
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [userId, portfolioId]);

  /**
   * Insert a single transaction.
   */
  const addTransaction = useCallback(
    async (input: TransactionInput): Promise<Transaction | null> => {
      if (!userId || portfolioId == null) return null;

      const { data, error: err } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          portfolio_id: portfolioId,
          ticker: input.ticker,
          trade_date: input.trade_date,
          shares: input.shares,
          price: input.price,
          note: input.note ?? '',
        })
        .select()
        .single();

      if (err || !data) {
        setError(err?.message ?? 'add failed');
        return null;
      }

      updateCache((prev) => [data as Transaction, ...prev]);
      return data as Transaction;
    },
    [userId, portfolioId, updateCache],
  );

  /**
   * Bulk insert (CSV import). Splits into chunks of 500 rows to stay within
   * payload limits. Returns counts.
   */
  const bulkInsert = useCallback(
    async (
      inputs: TransactionInput[],
      onProgress?: (done: number, total: number) => void,
    ): Promise<{ inserted: number; failed: number }> => {
      if (!userId || portfolioId == null) {
        return { inserted: 0, failed: inputs.length };
      }

      let inserted = 0;
      let failed = 0;
      const total = inputs.length;
      const CHUNK = 500;

      for (let i = 0; i < inputs.length; i += CHUNK) {
        const chunk = inputs.slice(i, i + CHUNK).map((t) => ({
          user_id: userId,
          portfolio_id: portfolioId,
          ticker: t.ticker,
          trade_date: t.trade_date,
          shares: t.shares,
          price: t.price,
          note: t.note ?? '',
        }));
        const { data, error: err } = await supabase
          .from('transactions')
          .insert(chunk)
          .select();
        if (err) {
          failed += chunk.length;
          setError(err.message);
        } else {
          inserted += data?.length ?? chunk.length;
          if (data) {
            updateCache((prev) => [...(data as Transaction[]), ...prev]);
          }
        }
        onProgress?.(Math.min(i + chunk.length, total), total);
      }

      return { inserted, failed };
    },
    [userId, portfolioId, updateCache],
  );

  /**
   * Delete a transaction (hard delete — transactions don't use soft delete).
   */
  const deleteTransaction = useCallback(
    async (id: number): Promise<boolean> => {
      const prev = cacheRef.current;
      updateCache((p) => p.filter((t) => t.id !== id));
      const { error: err } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      if (err) {
        cacheRef.current = prev;
        if (portfolioId != null) moduleCache.set(portfolioId, prev);
        setTransactions(prev);
        setError(err.message);
        return false;
      }
      return true;
    },
    [portfolioId, updateCache],
  );

  /**
   * Delete ALL transactions for this portfolio. Used by the "replace
   * existing" flow in the CSV import wizard as a clean-slate escape hatch.
   */
  const deleteAllForPortfolio = useCallback(async (): Promise<boolean> => {
    if (!userId || portfolioId == null) return false;
    const prev = cacheRef.current;
    updateCache(() => []);
    const { error: err } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .eq('portfolio_id', portfolioId);
    if (err) {
      cacheRef.current = prev;
      if (portfolioId != null) moduleCache.set(portfolioId, prev);
      setTransactions(prev);
      setError(err.message);
      return false;
    }
    return true;
  }, [userId, portfolioId, updateCache]);

  return {
    transactions,
    isLoading,
    error,
    addTransaction,
    bulkInsert,
    deleteTransaction,
    deleteAllForPortfolio,
  };
}
