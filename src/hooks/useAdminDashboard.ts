import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AdminUser {
  id: string;
  email: string | null;
  created_at: string | null;
  is_pro: boolean;
  membership_level: string;
  max_tabs: number;
  max_tasks: number;
}

export interface AdminStats {
  totalUsers: number;
  proUsers: number;
  totalTasks: number;
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
export function useAdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, proUsers: 0, totalTasks: 0 });
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

      if (usersResult.error) throw usersResult.error;
      if (statsResult.error) throw statsResult.error;

      const userList: AdminUser[] = (usersResult.data ?? []).map(
        (row: {
          id: string;
          email: string | null;
          created_at: string | null;
          is_pro: boolean;
          membership_level: string;
          max_tabs: number;
          max_tasks: number;
        }) => ({
          id: row.id,
          email: row.email,
          created_at: row.created_at,
          is_pro: row.is_pro ?? false,
          membership_level: row.membership_level ?? 'free',
          max_tabs: row.max_tabs ?? 3,
          max_tasks: row.max_tasks ?? 30,
        })
      );

      setUsers(userList);

      const s = statsResult.data as { total_users: number; pro_users: number; total_tasks: number };
      setStats({
        totalUsers: Number(s.total_users ?? 0),
        proUsers: Number(s.pro_users ?? 0),
        totalTasks: Number(s.total_tasks ?? 0),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load admin data';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePro = useCallback(
    async (userId: string, currentIsPro: boolean) => {
      setTogglingId(userId);
      const newIsPro = !currentIsPro;
      const newLevel = newIsPro ? 'pro' : 'free';
      const newMaxTabs = newIsPro ? 30 : 3;
      const newMaxTasks = newIsPro ? 1000 : 30;

      // Optimistic update
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, is_pro: newIsPro, membership_level: newLevel, max_tabs: newMaxTabs, max_tasks: newMaxTasks }
            : u
        )
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
        // Rollback on failure
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  is_pro: currentIsPro,
                  membership_level: currentIsPro ? 'pro' : 'free',
                  max_tabs: currentIsPro ? 30 : 3,
                  max_tasks: currentIsPro ? 1000 : 30,
                }
              : u
          )
        );
        setStats((prev) => ({
          ...prev,
          proUsers: Math.max(0, prev.proUsers + (currentIsPro ? 1 : -1)),
        }));
        setError(err instanceof Error ? err.message : 'Failed to update user');
      } finally {
        setTogglingId(null);
      }
    },
    []
  );

  return { users, stats, isLoading, error, togglePro, togglingId, refetch: fetchData };
}
