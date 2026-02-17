import { memo, useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
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
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

// ──────────────────────────────────────────────────
// TaskItem
// ──────────────────────────────────────────────────
export const TaskItem = memo(({ task, onToggle, onUpdate, onDelete }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [usePopFallback, setUsePopFallback] = useState(false);
  const [showDeconstruction, setShowDeconstruction] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textSpanRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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

  // Merge dnd-kit ref with our cardRef
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

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

  // Completion shake/pop cleanup
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

  // Capture textColor at toggle time (aging.textColor is time-dependent)
  const deconstructionColorRef = useRef<string>(aging.textColor);

  const handleToggle = useCallback(
    (checked: boolean) => {
      onToggle(task.id, checked);
      if (checked) {
        const hapticOk = tryHaptic();
        setJustCompleted(true);
        setUsePopFallback(!hapticOk);
        // Only trigger if text has decomposable content
        const groups = decomposeToJamoGrouped(task.text);
        if (groups.flat().length > 0) {
          deconstructionColorRef.current = aging.textColor;
          setShowDeconstruction(true);  // ← synchronous, no setTimeout
        }
      } else {
        // Unchecked during animation → cancel
        setShowDeconstruction(false);
      }
    },
    [task.id, task.text, onToggle, aging.textColor],
  );

  // Cancel recovery: if parent sets is_completed=false
  useEffect(() => {
    if (!task.is_completed) {
      setShowDeconstruction(false);
    }
  }, [task.is_completed]);

  const handleDeconstructionComplete = useCallback(() => {
    setShowDeconstruction(false);
  }, []);

  // ── Edit handlers ──
  const startEditing = () => { setEditText(task.text); setIsEditing(true); };
  const saveEdit = () => {
    const t = editText.trim();
    if (t && t !== task.text) onUpdate(task.id, t);
    setIsEditing(false);
  };
  const cancelEdit = () => { setEditText(task.text); setIsEditing(false); };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  const iconClass = aging.isDark
    ? 'text-white/80 hover:text-white transition-colors p-1'
    : 'text-zinc-400 hover:text-zinc-600 transition-colors p-1';
  const deleteIconClass = aging.isDark
    ? 'text-white/80 hover:text-red-300 transition-colors p-1'
    : 'text-zinc-400 hover:text-red-500 transition-colors p-1';

  const completionAnimClass = justCompleted
    ? usePopFallback ? 'animate-shake-pop-complete' : 'animate-shake-complete'
    : '';

  return (
    <div
      ref={mergedRef}
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
        <div className="relative flex-1 min-w-0 flex flex-col gap-0.5 min-h-[2rem]">
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
          )}
          {/* Debug: aging info */}
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
              <button onClick={startEditing} className={iconClass} aria-label="수정">
                <Pencil className="w-5 h-5" />
              </button>
              <button onClick={() => setShowDeleteModal(true)} className={deleteIconClass} aria-label="삭제">
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Deconstruction animation (Portal-based, overlays entire card) ── */}
      {showDeconstruction && task.is_completed && (
        <DeconstructionCanvas
          text={task.text}
          cardRef={cardRef}
          textSpanRef={textSpanRef}
          textColor={deconstructionColorRef.current}
          onComplete={handleDeconstructionComplete}
        />
      )}

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="할 일 삭제"
        message={`"${task.text}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={() => { setShowDeleteModal(false); onDelete(task.id); }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}, (prev, next) => (
  prev.task.id === next.task.id &&
  prev.task.text === next.task.text &&
  prev.task.is_completed === next.task.is_completed &&
  prev.task.order_index === next.task.order_index &&
  prev.task.created_at === next.task.created_at &&
  prev.task.completed_at === next.task.completed_at &&
  prev.onToggle === next.onToggle &&
  prev.onUpdate === next.onUpdate &&
  prev.onDelete === next.onDelete
));
