import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Tab } from '@/lib/types';
import { ConfirmModal } from './ConfirmModal';

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
 * ✨ UX 개선 사항:
 * - PC: 좌우 Chevron 버튼 + 마우스 휠 가로 스크롤
 * - 새 탭 생성 시: 자동 선택 + 자동 스크롤 + 즉시 편집 모드
 * - 활성 탭에 Pencil 아이콘으로 이름 변경 기능 명시
 * - Optimistic ID 교체 시 편집 상태 자동 유지
 */
export const TabBar = ({
  tabs,
  selectedTabId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: TabBarProps) => {
  // --- State ---
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTabId, setDeleteTabId] = useState<number | null>(null);
  const [shouldAutoEdit, setShouldAutoEdit] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // --- Derived ---
  const deleteTargetTab = deleteTabId !== null ? tabs.find((t) => t.id === deleteTabId) : null;

  // ──────────────────────────────────────────────
  // 1. PC Scroll: Overflow 감지 + Chevron 표시
  // ──────────────────────────────────────────────
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, tabs.length]);

  // 마우스 휠 → 가로 스크롤 변환 (non-passive for preventDefault)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const scrollByAmount = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -150 : 150,
      behavior: 'smooth',
    });
  };

  // ──────────────────────────────────────────────
  // 2. Auto-scroll: 활성 탭이 항상 보이도록
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [selectedTabId]);

  // ──────────────────────────────────────────────
  // 3. Auto-edit: 새 탭 생성 후 즉시 편집 모드
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (shouldAutoEdit && selectedTabId !== null) {
      const newTab = tabs.find((t) => t.id === selectedTabId);
      if (newTab) {
        requestAnimationFrame(() => {
          setEditingTabId(newTab.id);
          setEditTitle(newTab.title);
          setShouldAutoEdit(false);
        });
      }
    }
  }, [shouldAutoEdit, selectedTabId, tabs]);

  // Optimistic ID 교체 시 편집 상태 유지
  // (서버 응답으로 탭 ID가 바뀌어도 편집 모드가 끊기지 않도록)
  useEffect(() => {
    if (editingTabId !== null && !tabs.some((t) => t.id === editingTabId)) {
      if (selectedTabId !== null && tabs.some((t) => t.id === selectedTabId)) {
        setEditingTabId(selectedTabId);
      } else {
        setEditingTabId(null);
      }
    }
  }, [tabs, editingTabId, selectedTabId]);

  // 편집 모드 진입 시 자동 포커스 + 전체 선택
  useEffect(() => {
    if (editingTabId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  // ──────────────────────────────────────────────
  // Editing 함수
  // ──────────────────────────────────────────────
  const startEditing = (tab: Tab) => {
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const saveEdit = () => {
    if (editingTabId !== null && editTitle.trim()) {
      onUpdate(editingTabId, editTitle.trim());
    }
    setEditingTabId(null);
  };

  const cancelEdit = () => {
    setEditingTabId(null);
    setEditTitle('');
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

  // + 버튼 핸들러: 생성 + 자동 편집 플래그
  const handleAdd = () => {
    setShouldAutoEdit(true);
    onAdd();
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="flex items-end gap-0 bg-zinc-100 pl-1 pr-1 pt-2 rounded-t-2xl overflow-hidden">
      {/* 좌측 Chevron (오버플로 시에만 표시) */}
      {canScrollLeft && (
        <button
          onClick={() => scrollByAmount('left')}
          className="flex-shrink-0 flex items-center justify-center w-6 h-8 mb-0.5 text-zinc-400 hover:text-zinc-700 transition-colors"
          aria-label="탭 왼쪽 스크롤"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

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
              ref={isActive ? activeTabRef : undefined}
              onClick={() => !isEditing && onSelect(tab.id)}
              onDoubleClick={() => startEditing(tab)}
              className={`
                group relative flex items-center gap-1 px-3 py-2.5
                rounded-t-lg cursor-pointer select-none
                transition-all duration-200 ease-out
                min-w-[80px] max-w-[200px] flex-shrink-0
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

              {/* 이름 변경 버튼 (Pencil) — 활성 탭에만 표시 */}
              {!isEditing && isActive && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(tab);
                  }}
                  className="flex-shrink-0 text-zinc-300 hover:text-zinc-600 transition-colors p-0.5"
                  aria-label="탭 이름 변경"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}

              {/* 닫기(X) 버튼 */}
              {!isEditing && tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTabId(tab.id);
                  }}
                  className={`
                    flex-shrink-0 rounded-full p-0.5
                    transition-all duration-150
                    ${
                      isActive
                        ? 'text-zinc-400 hover:text-red-500 hover:bg-red-50 opacity-100'
                        : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 opacity-0 hover-hover:group-hover:opacity-100'
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

      {/* 우측 Chevron (오버플로 시에만 표시) */}
      {canScrollRight && (
        <button
          onClick={() => scrollByAmount('right')}
          className="flex-shrink-0 flex items-center justify-center w-6 h-8 mb-0.5 text-zinc-400 hover:text-zinc-700 transition-colors"
          aria-label="탭 오른쪽 스크롤"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* 새 탭 추가 버튼 */}
      <button
        onClick={handleAdd}
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 mb-0.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-all duration-150"
        aria-label="새 탭 추가"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* 탭 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={deleteTabId !== null}
        title="탭 삭제"
        message={`"${deleteTargetTab?.title ?? ''}" 탭을 삭제하시겠습니까?\n탭에 포함된 모든 할 일도 함께 삭제됩니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={() => {
          if (deleteTabId !== null) {
            onDelete(deleteTabId);
          }
          setDeleteTabId(null);
        }}
        onCancel={() => setDeleteTabId(null)}
      />
    </div>
  );
};
