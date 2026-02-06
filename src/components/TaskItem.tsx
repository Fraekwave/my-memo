import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, X } from 'lucide-react';
import { Task } from '@/lib/types';
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
 * ✨ Drag & Drop:
 * - GripVertical 핸들로만 드래그 활성화 (setActivatorNodeRef)
 * - 체크박스, 텍스트 클릭, 편집과 충돌 없음
 * - 드래그 중 시각적 피드백 (opacity, shadow)
 *
 * ✨ 커스텀 삭제 확인 모달
 */
export const TaskItem = ({ task, onToggle, onUpdate, onDelete }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── @dnd-kit Sortable ──
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: task.id });

  // 드래그 중에는 transition 비활성화 (CSS .task-item의 transition: all과 충돌 방지)
  // 비드래그 아이템은 useSortable의 reorder 애니메이션 transition 사용
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : sortableTransition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' as const : undefined,
  };

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        task-item flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-100
        hover:border-zinc-200 hover:shadow-sm
        ${isDragging ? 'shadow-lg ring-1 ring-zinc-200 !bg-white' : ''}
      `}
    >
      {/* 드래그 핸들 — 이 요소만 드래그를 활성화 */}
      {!isEditing && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="touch-none flex-shrink-0 text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing p-0.5 -ml-1"
          aria-label="순서 변경"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}

      {/* 체크박스 */}
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.is_completed}
        onChange={(e) => onToggle(task.id, e.target.checked)}
        disabled={isEditing || isDragging}
      />

      {/* 텍스트 or 입력창 */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 bg-white border border-zinc-300 rounded-lg text-zinc-900 outline-none focus:border-zinc-900 transition-colors"
          />
        ) : (
          <span
            className={`block text-zinc-900 ${
              task.is_completed ? 'completed' : ''
            }`}
          >
            {task.text}
          </span>
        )}
      </div>

      {/* 액션 버튼들 */}
      <div className="flex items-center gap-2">
        {!isEditing && !isDragging && (
          <>
            {/* 수정 버튼 (Pencil 아이콘) */}
            <button
              onClick={startEditing}
              className="text-zinc-400 hover:text-zinc-600 transition-colors p-1"
              aria-label="수정"
            >
              <Pencil className="w-4 h-4" />
            </button>

            {/* 삭제 버튼 — 모달로 확인 */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="text-zinc-400 hover:text-red-500 transition-colors p-1"
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
};
