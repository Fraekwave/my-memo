import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X } from 'lucide-react';
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
 * ✨ Drag & Drop (Whole-Body):
 * - 아이템 전체가 드래그 대상 (핸들 없음)
 * - Mouse: 10px 이동 시 활성화 / Touch: 250ms Long Press 시 활성화
 * - Checkbox, Button, Input 클릭은 SmartSensor에서 필터링되어 드래그 미발생
 * - 편집 모드에서는 드래그 리스너 비활성화
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
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: task.id });

  // DragOverlay 패턴:
  // - isDragging인 아이템은 "플레이스홀더"로 표시 (dimmed)
  // - 실제 드래그 비주얼은 TaskList의 DragOverlay에서 렌더링
  // - 플레이스홀더는 리스트 레이아웃을 유지하면서 부드럽게 이동
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: sortableTransition,
    opacity: isDragging ? 0.3 : undefined,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={`
        task-item flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-100
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
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 bg-white border border-zinc-300 rounded-lg text-zinc-900 outline-none focus:border-zinc-900 transition-colors select-text"
          />
        ) : (
          <span
            className={`block text-zinc-900 select-none ${
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
