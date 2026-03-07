import { useCallback, useState } from 'react';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import i18n from '@/i18n/config';

export type AccountDeletionResult = 'success' | 'auth_required' | 'error';

type DeleteAccountErrorPayload = {
  error?: string;
  code?: string;
};

export const useAccountDeletion = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  const ensureFreshSession = useCallback(async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      return false;
    }

    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const expiresSoon = expiresAtMs === 0 || expiresAtMs - Date.now() < 60_000;

    if (!expiresSoon) {
      return true;
    }

    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError || !refreshedSession) {
      return false;
    }

    return true;
  }, []);

  const invokeDeleteAccount = useCallback(async () => {
    const { error: invokeError } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
      body: {},
    });

    if (invokeError) {
      throw invokeError;
    }
  }, []);

  const parseHttpError = useCallback(async (err: FunctionsHttpError) => {
    try {
      const payload = (await err.context.clone().json()) as DeleteAccountErrorPayload;
      return payload;
    } catch {
      return null;
    }
  }, []);

  const deleteAccount = useCallback(async (): Promise<AccountDeletionResult> => {
    setIsDeleting(true);
    setError(null);

    try {
      const hasFreshSession = await ensureFreshSession();
      if (!hasFreshSession) {
        setError(i18n.t('account.delete.errorSessionExpired'));
        return 'auth_required';
      }

      try {
        await invokeDeleteAccount();
        return 'success';
      } catch (err) {
        if (err instanceof FunctionsHttpError && err.context.status === 401) {
          const {
            data: { session: refreshedSession },
            error: refreshError,
          } = await supabase.auth.refreshSession();

          if (!refreshError && refreshedSession) {
            await invokeDeleteAccount();
            return 'success';
          }
        }

        throw err;
      }
    } catch (err) {
      if (err instanceof FunctionsHttpError) {
        const payload = await parseHttpError(err);

        if (err.context.status === 401) {
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
  }, [ensureFreshSession, invokeDeleteAccount, parseHttpError]);

  return {
    isDeleting,
    error,
    deleteAccount,
    reset,
  };
};
