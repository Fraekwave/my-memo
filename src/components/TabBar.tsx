import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Tab } from '@/lib/types';

interface TabBarProps {
  tabs: Tab[];
  selectedTabId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onUpdate: (id: number, newTitle: string) => void;
  onDelete: (id: number) => void;
}

/**
 * 브라우저 스타일 탭 바 컴포넌트
 *
 * - 가로 스크롤 가능한 탭 목록
 * - 활성 탭: 흰색 배경 + 진한 글씨
 * - 비활성 탭: 회색 배경 + 연한 글씨
 * - 더블 클릭으로 인라인 이름 편집
 * - X 버튼으로 탭 삭제
 * - + 버튼으로 새 탭 추가
 */
export const TabBar = ({
  tabs,
  selectedTabId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: TabBarProps) => {
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 편집 모드 진입 시 자동 포커스
  useEffect(() => {
    if (editingTabId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  // 편집 시작 (더블 클릭)
  const startEditing = (tab: Tab) => {
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  // 편집 저장
  const saveEdit = () => {
    if (editingTabId !== null && editTitle.trim()) {
      onUpdate(editingTabId, editTitle.trim());
    }
    setEditingTabId(null);
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingTabId(null);
    setEditTitle('');
  };

  // 키보드 이벤트
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
    <div className="flex items-end gap-0 bg-zinc-100 px-2 pt-2 rounded-t-2xl overflow-hidden">
      {/* 스크롤 가능한 탭 영역 */}
      <div
        ref={scrollRef}
        className="flex items-end gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === selectedTabId;
          const isEditing = tab.id === editingTabId;

          return (
            <div
              key={tab.id}
              onClick={() => !isEditing && onSelect(tab.id)}
              onDoubleClick={() => startEditing(tab)}
              className={`
                group relative flex items-center gap-1.5 px-4 py-2.5 
                rounded-t-lg cursor-pointer select-none
                transition-all duration-200 ease-out
                min-w-[100px] max-w-[200px] flex-shrink-0
                ${
                  isActive
                    ? 'bg-white text-zinc-900 shadow-sm font-medium z-10'
                    : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300/70 hover:text-zinc-700'
                }
              `}
            >
              {/* 탭 제목 또는 편집 인풋 */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={handleKeyDown}
                  className="flex-1 min-w-0 bg-transparent border-b border-zinc-400 outline-none text-sm py-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 min-w-0 truncate text-sm">
                  {tab.title}
                </span>
              )}

              {/* 닫기(X) 버튼 — 편집 중이 아니고 탭이 2개 이상일 때만 표시 */}
              {!isEditing && tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(tab.id);
                  }}
                  className={`
                    flex-shrink-0 rounded-full p-0.5
                    transition-all duration-150
                    ${
                      isActive
                        ? 'text-zinc-400 hover:text-red-500 hover:bg-red-50 opacity-100'
                        : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                    }
                  `}
                  aria-label="탭 삭제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 새 탭 추가 버튼 */}
      <button
        onClick={onAdd}
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 mb-0.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-all duration-150"
        aria-label="새 탭 추가"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
