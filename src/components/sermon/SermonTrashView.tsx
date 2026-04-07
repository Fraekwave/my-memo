import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SermonNote } from '@/lib/types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getDaysUntilPurge(deletedAt: string | null | undefined): number | null {
  if (!deletedAt) return null;
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  const daysElapsed = Math.floor(elapsed / MS_PER_DAY);
  return 30 - daysElapsed;
}

interface SermonTrashViewProps {
  deletedNotes: SermonNote[];
  isLoading: boolean;
  onFetch: () => void;
  onRestore: (note: SermonNote) => Promise<boolean>;
  onClose: () => void;
}

export function SermonTrashView({ deletedNotes, isLoading, onFetch, onRestore, onClose }: SermonTrashViewProps) {
  const { t } = useTranslation();
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  useEffect(() => {
    onFetch();
  }, [onFetch]);

  const handleRestore = async (note: SermonNote) => {
    const ok = await onRestore(note);
    if (ok) {
      setRestoreFeedback(t('sermon.trashRestored'));
      setTimeout(() => setRestoreFeedback(null), 3000);
    }
  };

  const now = Date.now();
  const visibleDeleted = deletedNotes.filter((n) => {
    const deletedAt = n.deleted_at ? new Date(n.deleted_at).getTime() : 0;
    return now - deletedAt < THIRTY_DAYS_MS;
  });
  const purgedCount = deletedNotes.length - visibleDeleted.length;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <div className="inline-block w-8 h-8 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-light text-stone-900">{t('trash.trashTitle')}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-stone-500 hover:text-stone-700"
        >
          {t('common.close')}
        </button>
      </div>
      <p className="text-stone-500 text-xs font-light">
        {t('trash.purgeWarning')}
      </p>

      {restoreFeedback && (
        <p className="text-stone-800 text-sm font-medium py-2">{restoreFeedback}</p>
      )}

      {visibleDeleted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-stone-400 text-sm font-light">{t('trash.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleDeleted.map((note) => {
            const daysRemaining = getDaysUntilPurge(note.deleted_at);
            const purgeLabel =
              daysRemaining === null
                ? ''
                : daysRemaining <= 0
                  ? t('trash.deletesToday')
                  : daysRemaining === 1
                    ? t('trash.deletesTomorrow')
                    : t('trash.deletesInDays', { days: daysRemaining });
            return (
              <li
                key={note.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-stone-100 bg-stone-50"
              >
                <span className="flex-1 min-w-0 truncate text-sm text-stone-700">
                  {note.topic || note.date}
                </span>
                {purgeLabel && (
                  <span className="flex-shrink-0 text-xs text-stone-400 font-light tabular-nums">
                    {purgeLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRestore(note)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition-colors text-xs font-medium"
                  aria-label={t('trash.restore')}
                >
                  <RotateCcw className="w-4 h-4" strokeWidth={2} />
                  {t('trash.restore')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {purgedCount > 0 && (
        <p className="text-stone-400 text-xs font-light">
          {t('trash.purgedCount', { count: purgedCount })}
        </p>
      )}
    </div>
  );
}
