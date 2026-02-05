import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Pencil, X } from 'lucide-react';
import { Task } from '@/lib/types';

interface TaskItemProps {
  task: Task;
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
}

/**
 * 개별 Task 아이템 컴포넌트
 * 
 * ✨ 인라인 편집 기능 추가:
 * - Pencil 아이콘 클릭 → 텍스트가 input으로 변경
 * - Enter 키 → 저장
 * - Esc 키 → 취소
 * - Blur (포커스 해제) → 저장
 * 
 * 미니멀 디자인:
 * - 작고 심플한 Pencil 아이콘 (gray-400 → hover:gray-600)
 * - 테두리 없는 인라인 입력창
 * - 시선을 방해하지 않는 디자인
 */
export const TaskItem = ({ task, onToggle, onUpdate, onDelete }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드 진입 시 자동 포커스
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // 전체 텍스트 선택
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
    <div className="task-item flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all">
      {/* 체크박스 */}
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.is_completed}
        onChange={(e) => onToggle(task.id, e.target.checked)}
        disabled={isEditing} // 편집 중에는 체크박스 비활성화
      />

      {/* 텍스트 or 입력창 */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveEdit} // 포커스 해제 시 저장
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
        {!isEditing && (
          <>
            {/* 수정 버튼 (Pencil 아이콘) */}
            <button
              onClick={startEditing}
              className="text-zinc-400 hover:text-zinc-600 transition-colors p-1"
              aria-label="수정"
            >
              <Pencil className="w-4 h-4" />
            </button>

            {/* 삭제 버튼 */}
            <button
              onClick={() => onDelete(task.id)}
              className="text-zinc-400 hover:text-red-500 transition-colors p-1"
              aria-label="삭제"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
