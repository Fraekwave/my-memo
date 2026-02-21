import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Supabase Auth session hook
 * - Persists session across reloads
 * - Returns user ID for RLS-filtered queries
 * - Detects PASSWORD_RECOVERY: user must set new password before using app
 */
export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearRecoveryMode = useCallback(() => {
    setIsRecoveryMode(false);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    userId: session?.user?.id ?? null,
    isLoading,
    isRecoveryMode,
    clearRecoveryMode,
    signOut,
  };
};
