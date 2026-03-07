import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DeleteAccountDialogProps {
  isOpen: boolean;
  email: string | null | undefined;
  confirmationText: string;
  onConfirmationTextChange: (value: string) => void;
  isDeleting: boolean;
  isSuccess: boolean;
  error: string | null;
  requiresSignIn: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSignInAgain: () => void;
}

const normalizeConfirmationValue = (value: string, language: string) =>
  value.trim().normalize('NFKC').toLocaleUpperCase(language);

export const DeleteAccountDialog = ({
  isOpen,
  email,
  confirmationText,
  onConfirmationTextChange,
  isDeleting,
  isSuccess,
  error,
  requiresSignIn,
  onCancel,
  onConfirm,
  onSignInAgain,
}: DeleteAccountDialogProps) => {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmationWord = t('account.delete.confirmWord');
  const canConfirm =
    normalizeConfirmationValue(confirmationText, i18n.language) ===
    normalizeConfirmationValue(confirmationWord, i18n.language);

  useEffect(() => {
    if (!isOpen || requiresSignIn || isSuccess) return;

    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, isDeleting, isSuccess, onCancel, requiresSignIn]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={isDeleting ? undefined : onCancel}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-modal-backdrop" />

      <div
        className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl p-6 sm:p-7 animate-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {isSuccess ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" strokeWidth={1.8} />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900">
              {t('account.delete.successTitle')}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500 whitespace-pre-line">
              {t('account.delete.successMessage')}
            </p>
          </div>
        ) : (
          <>
        <div className="mb-5 flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-zinc-900">
              {t('account.delete.title')}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 whitespace-pre-line">
              {t('account.delete.body', { word: confirmationWord })}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {t('account.emailLabel')}
          </p>
          <p className="mt-1 break-all text-sm text-zinc-800">
            {email ?? t('account.emailUnavailable')}
          </p>
        </div>

        <div className="mt-4">
          <label
            htmlFor="delete-account-confirmation"
            className="block text-sm font-medium text-zinc-700 mb-2"
          >
            {t('account.delete.confirmLabel', { word: confirmationWord })}
          </label>
          <input
            id="delete-account-confirmation"
            ref={inputRef}
            type="text"
            value={confirmationText}
            disabled={isDeleting || requiresSignIn}
            onChange={(e) => onConfirmationTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm && !isDeleting) {
                e.preventDefault();
                onConfirm();
              }
            }}
            placeholder={t('account.delete.confirmPlaceholder', { word: confirmationWord })}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 outline-none transition-colors focus:border-zinc-500 disabled:bg-zinc-100"
          />
          <p className="mt-2 text-xs text-zinc-400">
            {t('account.delete.confirmHint', { word: confirmationWord })}
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          {requiresSignIn ? (
            <button
              type="button"
              onClick={onSignInAgain}
              className="flex-1 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              {t('account.delete.signInAgain')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm || isDeleting}
              className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                  {t('account.delete.processing')}
                </span>
              ) : (
                t('account.delete.confirmButton')
              )}
            </button>
          )}
        </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
