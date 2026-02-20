import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AdminUser {
  id: string;
  email: string | null;
  joined_at: string | null;        // renamed from created_at
  membership_level: string;        // 'free' | 'pro'
}

export interface AdminStats {
  totalUsers: number;
  proUsers: number;                // from total_pro
  activeTasks: number;             // from active_tasks
  deletedTasks: number;            // from deleted_tasks
}

/**
 * Admin-only hook. Calls SECURITY DEFINER RPC functions that bypass RLS.
 * The server-side functions verify the caller is the admin before returning data.
 *
 * Required Supabase SQL (run once in SQL editor):
 * ─────────────────────────────────────────────
 * -- 1. Add is_pro column to profiles
 * ALTER TABLE public.profiles
 *   ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
 *
 * UPDATE public.profiles
 *   SET is_pro = (membership_level = 'pro')
 *   WHERE is_pro IS DISTINCT FROM (membership_level = 'pro');
 *
 * -- 2. RPC: fetch all users (joins auth.users + public.profiles)
 * CREATE OR REPLACE FUNCTION admin_get_users()
 * RETURNS TABLE (
 *   id uuid, email text, created_at timestamptz,
 *   is_pro boolean, membership_level text, max_tabs int, max_tasks int
 * )
 * LANGUAGE plpgsql SECURITY DEFINER AS $$
 * BEGIN
 *   IF (SELECT email FROM auth.users WHERE id = auth.uid())
 *       != 'choi.seunghoon@gmail.com' THEN
 *     RAISE EXCEPTION 'Access denied';
 *   END IF;
 *   RETURN QUERY
 *   SELECT u.id, u.email, u.created_at,
 *     COALESCE(p.is_pro, false),
 *     COALESCE(p.membership_level, 'free'),
 *     COALESCE(p.max_tabs, 3),
 *     COALESCE(p.max_tasks, 30)
 *   FROM auth.users u
 *   LEFT JOIN public.profiles p ON p.id = u.id
 *   ORDER BY u.created_at DESC;
 * END; $$;
 *
 * -- 3. RPC: aggregated stats
 * CREATE OR REPLACE FUNCTION admin_get_stats()
 * RETURNS jsonb
 * LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE result jsonb;
 * BEGIN
 *   IF (SELECT email FROM auth.users WHERE id = auth.uid())
 *       != 'choi.seunghoon@gmail.com' THEN
 *     RAISE EXCEPTION 'Access denied';
 *   END IF;
 *   SELECT jsonb_build_object(
 *     'total_users',  (SELECT count(*) FROM auth.users),
 *     'pro_users',    (SELECT count(*) FROM public.profiles WHERE is_pro = true),
 *     'total_tasks',  (SELECT count(*) FROM public.mytask WHERE deleted_at IS NULL)
 *   ) INTO result;
 *   RETURN result;
 * END; $$;
 *
 * -- 4. RPC: toggle PRO for a user
 * CREATE OR REPLACE FUNCTION admin_set_pro(target_user_id uuid, new_is_pro boolean)
 * RETURNS void
 * LANGUAGE plpgsql SECURITY DEFINER AS $$
 * BEGIN
 *   IF (SELECT email FROM auth.users WHERE id = auth.uid())
 *       != 'choi.seunghoon@gmail.com' THEN
 *     RAISE EXCEPTION 'Access denied';
 *   END IF;
 *   INSERT INTO public.profiles (id, is_pro, membership_level, max_tabs, max_tasks)
 *     VALUES (
 *       target_user_id, new_is_pro,
 *       CASE WHEN new_is_pro THEN 'pro' ELSE 'free' END,
 *       CASE WHEN new_is_pro THEN 30 ELSE 3 END,
 *       CASE WHEN new_is_pro THEN 1000 ELSE 30 END
 *     )
 *   ON CONFLICT (id) DO UPDATE SET
 *     is_pro           = EXCLUDED.is_pro,
 *     membership_level = EXCLUDED.membership_level,
 *     max_tabs         = EXCLUDED.max_tabs,
 *     max_tasks        = EXCLUDED.max_tasks;
 * END; $$;
 */
/** Supabase PostgrestError is a plain object, not an Error subclass. Extract all fields. */
function extractError(err: unknown): string {
  if (!err) return 'Unknown error';
  // PostgrestError shape: { message, details, hint, code }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === 'string') parts.push(e.message);
    if (typeof e.details === 'string' && e.details) parts.push(`Details: ${e.details}`);
    if (typeof e.hint === 'string' && e.hint) parts.push(`Hint: ${e.hint}`);
    if (typeof e.code === 'string' && e.code) parts.push(`Code: ${e.code}`);
    if (parts.length > 0) return parts.join(' · ');
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useAdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, proUsers: 0, activeTasks: 0, deletedTasks: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [usersResult, statsResult] = await Promise.all([
        supabase.rpc('admin_get_users'),
        supabase.rpc('admin_get_stats'),
      ]);

      // Log raw responses for debugging — visible in browser DevTools console
      if (usersResult.error) {
        console.error('[admin] admin_get_users error:', usersResult.error);
        throw usersResult.error;
      }
      if (statsResult.error) {
        console.error('[admin] admin_get_stats error:', statsResult.error);
        throw statsResult.error;
      }

      console.debug('[admin] admin_get_users raw data:', usersResult.data);
      console.debug('[admin] admin_get_stats raw data:', statsResult.data);

      const userList: AdminUser[] = (usersResult.data ?? []).map(
        (row: {
          id: string;
          email: string | null;
          joined_at: string | null;
          membership_level: string;
        }) => ({
          id: row.id,
          email: row.email,
          joined_at: row.joined_at,
          membership_level: row.membership_level ?? 'free',
        })
      );

      setUsers(userList);

      // count(*) inside jsonb_build_object serialises as bigint → string in some
      // PostgreSQL/PostgREST versions; Number() coerces both "5" and 5 safely.
      const s = statsResult.data as {
        total_users: unknown;
        total_pro: unknown;
        active_tasks: unknown;
        deleted_tasks: unknown;
      };
      setStats({
        totalUsers: Number(s.total_users ?? 0),
        proUsers: Number(s.total_pro ?? 0),
        activeTasks: Number(s.active_tasks ?? 0),
        deletedTasks: Number(s.deleted_tasks ?? 0),
      });
    } catch (err: unknown) {
      const msg = extractError(err);
      console.error('[admin] fetchData failed:', err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePro = useCallback(
    async (userId: string, currentMembershipLevel: string) => {
      const currentIsPro = currentMembershipLevel === 'pro';
      setTogglingId(userId);
      const newIsPro = !currentIsPro;
      const newLevel = newIsPro ? 'pro' : 'free';

      // Optimistic update — only membership_level is returned by the new RPC schema
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, membership_level: newLevel } : u))
      );
      setStats((prev) => ({
        ...prev,
        proUsers: Math.max(0, prev.proUsers + (newIsPro ? 1 : -1)),
      }));

      try {
        const { error } = await supabase.rpc('admin_set_pro', {
          target_user_id: userId,
          new_is_pro: newIsPro,
        });
        if (error) throw error;
      } catch (err: unknown) {
        console.error('[admin] admin_set_pro error:', err);
        // Rollback on failure
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, membership_level: currentMembershipLevel } : u))
        );
        setStats((prev) => ({
          ...prev,
          proUsers: Math.max(0, prev.proUsers + (currentIsPro ? 1 : -1)),
        }));
        setError(extractError(err));
      } finally {
        setTogglingId(null);
      }
    },
    []
  );

  return { users, stats, isLoading, error, togglePro, togglingId, refetch: fetchData };
}
