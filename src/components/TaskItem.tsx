import { memo, useState, useRef, useEffect, KeyboardEvent } from 'react';
import {
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X } from 'lucide-react';
import { Task } from '@/lib/types';
import { getTaskAgingStyles } from '@/lib/visualAging';
import { ConfirmModal } from './ConfirmModal';

interface TaskItemProps {
  task: Task;
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
}

/**
 * 개별 Task 아이템 컴포넌트
 *
 * ✨ 인라인 편집 기능:
 * - Pencil 아이콘 클릭 → 텍스트가 input으로 변경
 * - Enter 키 → 저장 / Esc 키 → 취소 / Blur → 저장
 *
 * ✨ Drag & Drop (Whole-Body):
 * - 아이템 전체가 드래그 대상 (핸들 없음)
 * - Mouse: 10px 이동 시 활성화 / Touch: 250ms Long Press 시 활성화
 * - Checkbox, Button, Input 클릭은 SmartSensor에서 필터링되어 드래그 미발생
 * - 편집 모드에서는 드래그 리스너 비활성화
 *
 * ✨ 커스텀 삭제 확인 모달
 */
// ──────────────────────────────────────────────
// Custom animateLayoutChanges
// ──────────────────────────────────────────────
// 드래그 종료 직후(wasDragging) 아이템이 "하늘에서 떨어지는" 애니메이션 방지.
// - 정렬 중(isSorting): 기본 애니메이션 유지 (다른 아이템이 부드럽게 이동)
// - 드롭 직후(wasDragging): 애니메이션 비활성화 (즉시 최종 위치에 스냅)
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return false;
  }
  return defaultAnimateLayoutChanges(args);
};

// ──────────────────────────────────────────────
// React.memo: 불변 Task의 불필요한 리렌더 방지
// ──────────────────────────────────────────────
// useTasks의 setTasks(.map(...))는 변경되지 않은 task에도 새 객체 참조를 생성.
// 커스텀 비교 함수로 실제 데이터 필드만 비교하여 불필요한 렌더를 차단.
// 핸들러는 useCallback으로 안정화되어 있으므로 비교에 포함.
export const TaskItem = memo(({ task, onToggle, onUpdate, onDelete }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── @dnd-kit Sortable ──
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: task.id, animateLayoutChanges });

  // DragOverlay 패턴:
  // - isDragging인 아이템은 "플레이스홀더"로 표시 (dimmed)
  // - 실제 드래그 비주얼은 TaskList의 DragOverlay에서 렌더링
  // - 플레이스홀더는 리스트 레이아웃을 유지하면서 부드럽게 이동
  const aging = getTaskAgingStyles(task.created_at);
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: sortableTransition,
    opacity: isDragging ? 0.3 : undefined,
    backgroundColor: aging.backgroundColor,
  };

  // 편집 중에는 드래그 리스너 비활성화
  const dragProps = isEditing ? {} : { ...attributes, ...listeners };

  // 편집 모드 진입 시 자동 포커스
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 편집 시작
  const startEditing = () => {
    setEditText(task.text);
    setIsEditing(true);
  };

  // 편집 저장
  const saveEdit = () => {
    const trimmedText = editText.trim();
    if (trimmedText && trimmedText !== task.text) {
      onUpdate(task.id, trimmedText);
    }
    setIsEditing(false);
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditText(task.text);
    setIsEditing(false);
  };

  // 키보드 이벤트 처리
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={`
        task-item flex items-center gap-3 p-4 rounded-xl border border-zinc-100
        hover:border-zinc-200 hover:shadow-sm select-none
        ${isEditing ? 'cursor-auto' : 'cursor-grab'}
      `}
    >
      {/* 체크박스 */}
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.is_completed}
        onChange={(e) => onToggle(task.id, e.target.checked)}
        disabled={isEditing || isDragging}
      />

      {/* 텍스트 or 입력창 */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
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
            className={`block select-none ${task.is_completed ? 'completed' : ''}`}
            style={{ color: aging.textColor }}
          >
            {task.text}
          </span>
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
            {/* 수정 버튼 (Pencil 아이콘) */}
            <button
              onClick={startEditing}
              className={iconClass}
              aria-label="수정"
            >
              <Pencil className="w-4 h-4" />
            </button>

            {/* 삭제 버튼 — 모달로 확인 */}
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
  // 커스텀 비교: task 데이터 필드 + 핸들러 참조 비교
  // created_at 포함 — Visual Aging 스타일 계산에 사용
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
