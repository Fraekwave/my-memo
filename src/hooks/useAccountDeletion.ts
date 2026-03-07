import { useCallback, useState } from 'react';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import i18n from '@/i18n/config';

export type AccountDeletionResult = 'success' | 'auth_required' | 'error';

export const useAccountDeletion = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<AccountDeletionResult> => {
    setIsDeleting(true);
    setError(null);

    try {
      const { error: invokeError } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
        body: {},
      });

      if (invokeError) throw invokeError;
      return 'success';
    } catch (err) {
      if (err instanceof FunctionsHttpError) {
        if (err.context.status === 401) {
          setError(i18n.t('account.delete.errorSessionExpired'));
          return 'auth_required';
        }

        try {
          const payload = await err.context.json();
          if (payload && typeof payload.error === 'string') {
            setError(payload.error);
          } else {
            setError(i18n.t('account.delete.errorGeneric'));
          }
        } catch {
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
  }, []);

  return {
    isDeleting,
    error,
    deleteAccount,
    reset,
  };
};
