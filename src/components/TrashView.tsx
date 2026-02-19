import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Task, Tab } from '@/lib/types';
import { getTaskAgingStyles } from '@/lib/visualAging';

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
  tabs: Tab[];
  onFetch: () => void;
  onRestore: (task: Task) => Promise<string | null>;
}

/**
 * 휴지통 뷰: Soft Delete된 Task 목록 + 복구
 */
export const TrashView = ({
  deletedTasks,
  isLoading,
  tabs,
  onFetch,
  onRestore,
}: TrashViewProps) => {
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  useEffect(() => {
    onFetch();
  }, [onFetch]);

  const handleRestore = async (task: Task) => {
    const result = await onRestore(task);
    if (result) {
      setRestoreFeedback(`"${result}" 탭으로 복구되었습니다`);
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
        <div className="inline-block w-8 h-8 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-500 text-xs font-light">
        휴지통 항목은 30일 후 영구 삭제됩니다. 활성 노트는 절대 자동 삭제되지 않습니다.
      </p>

      {restoreFeedback && (
        <p className="text-zinc-800 text-sm font-medium py-2">{restoreFeedback}</p>
      )}

      {visibleDeleted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-zinc-400 text-sm font-light">휴지통이 비어 있습니다</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleDeleted.map((task) => {
            const aging = getTaskAgingStyles(task.created_at);
            const daysRemaining = getDaysUntilPurge(task.deleted_at);
            const purgeLabel =
              daysRemaining === null
                ? ''
                : daysRemaining <= 0
                  ? '오늘 삭제'
                  : daysRemaining === 1
                    ? '내일 삭제'
                    : `${daysRemaining}일 남음`;
            return (
              <li
                key={task.id}
                className="task-item flex items-center gap-3 p-4 rounded-xl border border-zinc-100 bg-zinc-50"
              >
                <span
                  className="flex-1 min-w-0 truncate text-sm"
                  style={{ color: aging.textColor }}
                >
                  {task.text}
                </span>
                {purgeLabel && (
                  <span
                    className="flex-shrink-0 text-xs text-zinc-400 font-light tabular-nums"
                    aria-label={`${purgeLabel}`}
                  >
                    {purgeLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRestore(task)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-colors text-xs font-medium"
                  aria-label="복구"
                >
                  <RotateCcw className="w-4 h-4" strokeWidth={2} />
                  복구
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {purgedCount > 0 && (
        <p className="text-zinc-400 text-xs font-light">
          {purgedCount}개 항목이 30일 경과로 영구 삭제되었습니다.
        </p>
      )}
    </div>
  );
};
