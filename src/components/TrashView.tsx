import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Task } from '@/lib/types';


const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days remaining until permanent purge. 0 = today is last day. Negative = already purged. */
function getDaysUntilPurge(deletedAt: string | null | undefined): number | null {
  if (!deletedAt) return null;
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  const daysElapsed = Math.floor(elapsed / MS_PER_DAY);
  return 30 - daysElapsed;
}

interface TrashViewProps {
  deletedTasks: Task[];
  isLoading: boolean;
  onFetch: () => void;
  onRestore: (task: Task) => Promise<string | null>;
}

/**
 * 휴지통 뷰: Soft Delete된 Task 목록 + 복구
 */
export const TrashView = ({
  deletedTasks,
  isLoading,
  onFetch,
  onRestore,
}: TrashViewProps) => {
  const { t } = useTranslation();
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  useEffect(() => {
    onFetch();
  }, [onFetch]);

  const handleRestore = async (task: Task) => {
    const result = await onRestore(task);
    if (result) {
      setRestoreFeedback(t('trash.restored', { tab: result }));
      setTimeout(() => setRestoreFeedback(null), 3000);
    }
  };

  const now = Date.now();
  const visibleDeleted = deletedTasks.filter((t) => {
    const deletedAt = t.deleted_at ? new Date(t.deleted_at).getTime() : 0;
    return now - deletedAt < THIRTY_DAYS_MS;
  });
  const purgedCount = deletedTasks.length - visibleDeleted.length;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <div className="inline-block w-8 h-8 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          {visibleDeleted.map((task) => {
            const daysRemaining = getDaysUntilPurge(task.deleted_at);
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
                key={task.id}
                className="task-item flex items-center gap-3 p-4 rounded-xl border border-stone-100 bg-stone-50"
              >
                <span
                  className="flex-1 min-w-0 truncate text-sm text-stone-700"
                >
                  {task.text}
                </span>
                {purgeLabel && (
                  <span
                    className="flex-shrink-0 text-xs text-stone-400 font-light tabular-nums"
                    aria-label={`${purgeLabel}`}
                  >
                    {purgeLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRestore(task)}
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
};
