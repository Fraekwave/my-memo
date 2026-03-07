import { useCallback, useState } from 'react';
import {
  FunctionsFetchError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import i18n from '@/i18n/config';

export type AccountDeletionResult = 'success' | 'auth_required' | 'error';

type DeleteAccountErrorPayload = {
  error?: string;
  code?: string;
};

type FreshSessionResult = {
  accessToken: string;
};

export const useAccountDeletion = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  const ensureFreshSession = useCallback(async (): Promise<FreshSessionResult | null> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      return null;
    }

    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const expiresSoon = expiresAtMs === 0 || expiresAtMs - Date.now() < 60_000;

    if (!expiresSoon) {
      return { accessToken: session.access_token };
    }

    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError || !refreshedSession) {
      return null;
    }

    return { accessToken: refreshedSession.access_token };
  }, []);

  const invokeDeleteAccount = useCallback(async (accessToken: string) => {
    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = new Error(`Delete account failed with status ${response.status}`) as Error & {
        status?: number;
        payload?: DeleteAccountErrorPayload | null;
      };

      error.status = response.status;

      try {
        error.payload = (await response.json()) as DeleteAccountErrorPayload;
      } catch {
        error.payload = null;
      }

      throw error;
    }
  }, []);

  const deleteAccount = useCallback(async (): Promise<AccountDeletionResult> => {
    setIsDeleting(true);
    setError(null);

    try {
      const freshSession = await ensureFreshSession();
      if (!freshSession) {
        setError(i18n.t('account.delete.errorSessionExpired'));
        return 'auth_required';
      }

      try {
        await invokeDeleteAccount(freshSession.accessToken);
        return 'success';
      } catch (err) {
        if (err instanceof Error && 'status' in err && err.status === 401) {
          const {
            data: { session: refreshedSession },
            error: refreshError,
          } = await supabase.auth.refreshSession();

          if (!refreshError && refreshedSession) {
            await invokeDeleteAccount(refreshedSession.access_token);
            return 'success';
          }
        }

        throw err;
      }
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        const status = typeof err.status === 'number' ? err.status : 500;
        const payload =
          'payload' in err && err.payload && typeof err.payload === 'object'
            ? (err.payload as DeleteAccountErrorPayload)
            : null;

        if (status === 401) {
          if (payload?.code) {
            console.warn('[delete-account] auth failure', payload.code);
          }
          setError(i18n.t('account.delete.errorSessionExpired'));
          return 'auth_required';
        }

        if (payload && typeof payload.error === 'string') {
          setError(payload.error);
        } else {
          setError(i18n.t('account.delete.errorGeneric'));
        }

        return 'error';
      }

      if (err instanceof FunctionsFetchError || err instanceof FunctionsRelayError) {
        setError(i18n.t('account.delete.errorNetwork'));
        return 'error';
      }

      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(i18n.t('account.delete.errorGeneric'));
      }

      return 'error';
    } finally {
      setIsDeleting(false);
    }
  }, [ensureFreshSession, invokeDeleteAccount]);

  return {
    isDeleting,
    error,
    deleteAccount,
    reset,
  };
};
