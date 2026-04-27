import { useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';

const SUPPORTED_LEGAL_LANGS = ['ko', 'en', 'ja', 'zh', 'de', 'es'];

interface AccountPrivacyPageProps {
  userEmail: string | null | undefined;
  onClose: () => void;
  onDeleted: () => Promise<void>;
  onRequireSignIn: () => Promise<void>;
}

export const AccountPrivacyPage = ({
  userEmail,
  onClose,
  onDeleted,
  onRequireSignIn,
}: AccountPrivacyPageProps) => {
  const { t, i18n } = useTranslation();
  const { isDeleting, error, deleteAccount, reset } = useAccountDeletion();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [isCompletingDeletion, setIsCompletingDeletion] = useState(false);
  const [isDeleteSuccess, setIsDeleteSuccess] = useState(false);
  const [requiresSignIn, setRequiresSignIn] = useState(false);

  const legalLang = SUPPORTED_LEGAL_LANGS.includes(i18n.language) ? i18n.language : 'en';
  const legalUrl = `/legal_${legalLang}.html`;
  const isBusy = isDeleting || isCompletingDeletion;

  const openDeleteDialog = () => {
    reset();
    setRequiresSignIn(false);
    setConfirmationText('');
    setIsCompletingDeletion(false);
    setIsDeleteSuccess(false);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isBusy) return;
    reset();
    setRequiresSignIn(false);
    setConfirmationText('');
    setIsCompletingDeletion(false);
    setIsDeleteSuccess(false);
    setIsDeleteDialogOpen(false);
  };

  const handleConfirmDelete = async () => {
    const result = await deleteAccount();

    if (result === 'success') {
      setIsCompletingDeletion(true);
      setIsDeleteSuccess(true);
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      await onDeleted();
      return;
    }

    if (result === 'auth_required') {
      setRequiresSignIn(true);
    }
  };

  const handleSignInAgain = () => {
    void onRequireSignIn();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-stone-50 flex flex-col overflow-hidden animate-fade-in"
        style={{ backgroundImage: 'var(--surface-page-grad)', backgroundColor: 'var(--surface-page)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-stone-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 -ml-1.5 text-stone-400 hover:text-stone-700 transition-colors rounded-lg"
            aria-label={t('common.close')}
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>

          <div className="flex flex-col items-center">
            <span
              className="text-sm font-semibold text-stone-900"
              style={{ letterSpacing: '-0.03em' }}
            >
              {t('account.title')}
            </span>
            <span className="text-[10px] text-stone-400 font-mono">MamaVault · 엄마의 외장하드</span>
          </div>

          <div className="w-8" aria-hidden />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
            <section className="bg-white rounded-3xl border border-stone-100 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                {t('account.emailLabel')}
              </p>
              <p className="mt-2 break-all text-base text-stone-900">
                {userEmail ?? t('account.emailUnavailable')}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-stone-500">
                {t('account.description')}
              </p>
            </section>

            <section className="bg-white rounded-3xl border border-stone-100 overflow-hidden">
              <button
                type="button"
                onClick={() => window.open(legalUrl, '_blank', 'noopener,noreferrer')}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-stone-50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
                    <FileText className="h-4 w-4" strokeWidth={1.7} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      {t('account.privacyPolicy')}
                    </p>
                    <p className="text-xs text-stone-500">
                      {t('account.privacyPolicyDescription')}
                    </p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-stone-300" strokeWidth={1.7} />
              </button>
            </section>

            <section className="bg-white rounded-3xl border border-stone-100 p-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <ShieldAlert className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-stone-900">
                    {t('account.delete.cardTitle')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-500 whitespace-pre-line">
                    {t('account.delete.cardBody')}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div className="flex items-center gap-2 text-stone-500 mb-2">
                  <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    {t('account.delete.dataLabel')}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-stone-600">
                  {t('account.delete.dataDescription')}
                </p>
              </div>

              <button
                type="button"
                onClick={openDeleteDialog}
                className="mt-5 w-full rounded-2xl bg-red-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                {t('account.delete.openButton')}
              </button>
            </section>
          </div>
        </div>
      </div>

      <DeleteAccountDialog
        isOpen={isDeleteDialogOpen}
        email={userEmail}
        confirmationText={confirmationText}
        onConfirmationTextChange={setConfirmationText}
        isDeleting={isBusy}
        isSuccess={isDeleteSuccess}
        error={error}
        requiresSignIn={requiresSignIn}
        onCancel={closeDeleteDialog}
        onConfirm={handleConfirmDelete}
        onSignInAgain={handleSignInAgain}
      />
    </>
  );
};
