import { memo, useState, useRef, useEffect, useCallback, useLayoutEffect, KeyboardEvent } from 'react';
import {
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X } from 'lucide-react';
import { Task } from '@/lib/types';
import { tryHaptic } from '@/lib/haptic';
import { decomposeToJamoGrouped } from '@/lib/hangulUtils';
import { getTaskAgingStyles } from '@/lib/visualAging';
import { ConfirmModal } from './ConfirmModal';
import { DeconstructionCanvas } from './DeconstructionCanvas';

const COMPLETION_ANIMATION_MS = 400;

interface TaskItemProps {
  task: Task;
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
}

// ──────────────────────────────────────────────────
// Custom animateLayoutChanges
// ──────────────────────────────────────────────────
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return false;
  }
  return defaultAnimateLayoutChanges(args);
};

// ──────────────────────────────────────────────────
// React.memo with custom comparator
// ──────────────────────────────────────────────────
export const TaskItem = memo(({ task, onToggle, onUpdate, onDelete }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [usePopFallback, setUsePopFallback] = useState(false);
  const [showDeconstruction, setShowDeconstruction] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // ★ FIX 1: Separate ref for the TEXT SPAN only (not the whole container with debug line)
  const textSpanRef = useRef<HTMLSpanElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── @dnd-kit Sortable ──
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: task.id, animateLayoutChanges });

  const aging = getTaskAgingStyles(task.created_at);
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: sortableTransition,
    opacity: isDragging ? 0.3 : undefined,
    backgroundColor: aging.backgroundColor,
  };

  const dragProps = isEditing ? {} : { ...attributes, ...listeners };

  // Auto-focus on edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Completion animation cleanup
  useEffect(() => {
    if (!justCompleted) return;

    completionTimeoutRef.current = setTimeout(() => {
      setJustCompleted(false);
      setUsePopFallback(false);
      completionTimeoutRef.current = null;
    }, COMPLETION_ANIMATION_MS);

    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
    };
  }, [justCompleted]);

  // ★ FIX 2: Measure BEFORE paint using useLayoutEffect + measure TEXT SPAN (not container)
  //    This eliminates the two-render-cycle gap that caused the race condition.
  //    Also uses requestAnimationFrame as fallback for when layout isn't ready.
  useLayoutEffect(() => {
    if (!showDeconstruction) {
      setCanvasSize(null);
      return;
    }

    const measure = () => {
      // Prefer measuring the text span; fall back to the container
      const el = textSpanRef.current ?? textContainerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      if (w >= 10 && h >= 10) {
        setCanvasSize({ width: w, height: h });
      } else {
        // Element may not be laid out yet; retry on next frame
        requestAnimationFrame(() => {
          const retryRect = el.getBoundingClientRect();
          const rw = Math.round(retryRect.width);
          const rh = Math.round(retryRect.height);
          if (rw >= 10 && rh >= 10) {
            setCanvasSize({ width: rw, height: rh });
          } else {
            // Still too small — use the container as fallback with min dimensions
            const containerEl = textContainerRef.current;
            if (containerEl) {
              const cRect = containerEl.getBoundingClientRect();
              setCanvasSize({
                width: Math.max(Math.round(cRect.width), 100),
                height: Math.max(Math.round(cRect.height), 32),
              });
            }
          }
        });
      }
    };

    measure();
  }, [showDeconstruction]);

  // ★ FIX 3: Stabilize onComplete so DeconstructionCanvas useEffect doesn't re-trigger
  const handleDeconstructionComplete = useCallback(() => {
    setShowDeconstruction(false);
    setCanvasSize(null);
  }, []);

  // ★ FIX 4: Stabilize textColor to prevent DeconstructionCanvas useEffect re-trigger
  //    aging.textColor can change between renders since it's time-based.
  //    Capture the color at toggle time so it stays constant during animation.
  const deconstructionColorRef = useRef<string>(aging.textColor);

  const handleToggle = useCallback(
    (checked: boolean) => {
      onToggle(task.id, checked);
      if (checked) {
        const hapticSucceeded = tryHaptic();
        setJustCompleted(true);
        setUsePopFallback(!hapticSucceeded);
        const grouped = decomposeToJamoGrouped(task.text);
        if (grouped.flat().length > 0) {
          // ★ Capture color at toggle time
          deconstructionColorRef.current = aging.textColor;
          setShowDeconstruction(true);
        }
      } else {
        setShowDeconstruction(false);
        setCanvasSize(null);
      }
    },
    [task.id, task.text, onToggle, aging.textColor]
  );

  // Cancel recovery
  useEffect(() => {
    if (!task.is_completed) {
      setShowDeconstruction(false);
      setCanvasSize(null);
    }
  }, [task.is_completed]);

  // Edit handlers
  const startEditing = () => {
    setEditText(task.text);
    setIsEditing(true);
  };

  const saveEdit = () => {
    const trimmedText = editText.trim();
    if (trimmedText && trimmedText !== task.text) {
      onUpdate(task.id, trimmedText);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditText(task.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const iconClass = aging.isDark
    ? 'text-white/80 hover:text-white transition-colors p-1'
    : 'text-zinc-400 hover:text-zinc-600 transition-colors p-1';
  const deleteIconClass = aging.isDark
    ? 'text-white/80 hover:text-red-300 transition-colors p-1'
    : 'text-zinc-400 hover:text-red-500 transition-colors p-1';

  const completionAnimClass = justCompleted
    ? usePopFallback
      ? 'animate-shake-pop-complete'
      : 'animate-shake-complete'
    : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={`
        task-item rounded-xl border border-zinc-100
        hover:border-zinc-200 hover:shadow-sm select-none
        ${isEditing ? 'cursor-auto' : 'cursor-grab'}
      `}
    >
      <div
        className={`
          flex items-center gap-3 p-4 w-full min-w-0
          ${completionAnimClass}
        `}
      >
      {/* 체크박스 */}
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.is_completed}
        onChange={(e) => handleToggle(e.target.checked)}
        disabled={isEditing || isDragging}
      />

      {/* 텍스트 or 입력창 */}
      <div
        ref={textContainerRef}
        className="relative flex-1 min-w-0 flex flex-col gap-0.5 min-h-[2rem]"
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            name="task_text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 bg-white border border-zinc-300 rounded-lg text-zinc-900 outline-none focus:border-zinc-900 transition-colors select-text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        ) : (
          <>
            {/* ★ FIX 5: Added ref to the text span for accurate measurement */}
            <span
              ref={textSpanRef}
              className={`block select-none ${task.is_completed ? 'completed' : ''}`}
              style={{
                color: aging.textColor,
                opacity: showDeconstruction ? 0.12 : 1,
                filter: showDeconstruction ? 'blur(1px)' : 'none',
              }}
              aria-hidden={showDeconstruction}
            >
              {task.text}
            </span>
            {/* ★ FIX 6: Canvas uses the container (not text span) for positioning,
                 but gets text-span dimensions for proper physics bounds.
                 Also uses captured textColor to prevent useEffect re-triggers. */}
            {showDeconstruction &&
              canvasSize &&
              task.is_completed && (
                <DeconstructionCanvas
                  text={task.text}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  textColor={deconstructionColorRef.current}
                  onComplete={handleDeconstructionComplete}
                />
              )}
          </>
        )}
        {/* Debug: Grace period + effective days + cubic easing */}
        <span
          className="text-[10px] text-red-500/80 font-mono tabular-nums"
          aria-hidden
        >
          {aging.isInGracePeriod
            ? `Fresh (Grace Period)`
            : `Age: ${aging.daysOld.toFixed(1)} / Effective: ${aging.effectiveDaysOld.toFixed(1)} / Dark: ${aging.darknessPercent.toFixed(1)}%`}
        </span>
      </div>

      {/* 액션 버튼들 */}
      <div className="flex items-center gap-2">
        {!isEditing && !isDragging && (
          <>
            <button
              onClick={startEditing}
              className={iconClass}
              aria-label="수정"
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className={deleteIconClass}
              aria-label="삭제"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      </div>

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="할 일 삭제"
        message={`"${task.text}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={() => {
          setShowDeleteModal(false);
          onDelete(task.id);
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}, (prev, next) => {
  return (
    prev.task.id === next.task.id &&
    prev.task.text === next.task.text &&
    prev.task.is_completed === next.task.is_completed &&
    prev.task.order_index === next.task.order_index &&
    prev.task.created_at === next.task.created_at &&
    prev.task.completed_at === next.task.completed_at &&
    prev.onToggle === next.onToggle &&
    prev.onUpdate === next.onUpdate &&
    prev.onDelete === next.onDelete
  );
});
