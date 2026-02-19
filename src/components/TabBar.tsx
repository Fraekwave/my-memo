import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { ALL_TAB_ID } from '@/hooks/useTasks';
import { Tab } from '@/lib/types';
import { ConfirmModal } from './ConfirmModal';
import { SortableTabItem } from './SortableTabItem';

interface TabBarProps {
  tabs: Tab[];
  selectedTabId: number | null;
  onSelect: (id: number) => void; // -1 = All (Master View)
  onAdd: () => number;
  onUpdate: (id: number, newTitle: string) => void;
  onDelete: (id: number) => void;
  onReorder: (activeId: number, overId: number) => void;
}

/**
 * 수평 이동만 허용하는 커스텀 Modifier
 * @dnd-kit/modifiers 패키지 없이 인라인으로 정의
 */
const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

/**
 * 브라우저 스타일 탭 바 컴포넌트
 *
 * ✨ UX 개선 사항:
 * - PC: 좌우 Chevron 버튼 + 마우스 휠 가로 스크롤
 * - 새 탭 생성 시: 자동 선택 + 자동 스크롤 + 즉시 편집 모드
 * - 활성 탭에 Pencil 아이콘으로 이름 변경 기능 명시
 * - Optimistic ID 교체 시 편집 상태 자동 유지
 * - Drag & Drop: @dnd-kit 기반 탭 순서 변경
 */
export const TabBar = ({
  tabs,
  selectedTabId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: TabBarProps) => {
  // --- State ---
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTabId, setDeleteTabId] = useState<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // --- Derived ---
  const deleteTargetTab = deleteTabId !== null ? tabs.find((t) => t.id === deleteTabId) : null;

  // ──────────────────────────────────────────────
  // DnD Sensors: 클릭/스크롤과 드래그를 구분
  // ──────────────────────────────────────────────
  // Mouse: 10px 이동해야 드래그 시작 (일반 클릭과 구분)
  // Touch: 250ms 롱프레스 + 5px 허용 오차 (수평 스크롤과 구분)
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 10 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(Number(active.id), Number(over.id));
    }
  };

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
  // 모바일: 키보드 애니메이션이 뷰포트를 리사이즈하면서 selection이 해제될 수 있음
  // → 단계적 재시도 (즉시 + 80ms + 200ms)로 선택 상태를 보장
  useEffect(() => {
    if (editingTabId === null) return;

    const selectInput = () => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    };

    // 즉시 시도
    selectInput();

    // 키보드 올라오는 중 재시도 (모바일 대응)
    const t1 = setTimeout(selectInput, 80);
    const t2 = setTimeout(selectInput, 200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
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

  /**
   * + 버튼 핸들러: flushSync 기반 동기적 Focus
   *
   * iOS Webkit은 focus()가 User Gesture의 동기 콜 스택 안에 있어야만
   * 가상 키보드를 활성화합니다. useEffect 경유 시 Gesture 체인이 끊기므로
   * flushSync로 React의 상태→DOM 업데이트를 동기적으로 강제하고,
   * 같은 콜 스택 내에서 focus()를 호출합니다.
   */
  const handleAdd = () => {
    // 1. 편집 중인 탭이 있으면 먼저 저장
    //    (Desktop: onMouseDown preventDefault로 blur 미발생 → 여기서 명시적으로 저장)
    //    (Mobile: blur → saveEdit가 이미 실행됨 → editingTabId === null이므로 skip)
    if (editingTabId !== null && editTitle.trim()) {
      onUpdate(editingTabId, editTitle.trim());
    }

    // 2. 탭 생성 — 동기적 optimistic update, optimistic ID 반환
    const newTabId = onAdd();

    // 3. flushSync: 편집 상태 + 새 탭 DOM을 같은 User Gesture 스택 안에서 커밋
    flushSync(() => {
      setEditingTabId(newTabId);
      setEditTitle('New Tab');
    });

    // 4. DOM이 동기적으로 업데이트된 직후 — 같은 User Gesture 스택 내에서 focus
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="flex items-end gap-0 bg-zinc-100 pl-1 pr-1 pt-2 rounded-t-2xl overflow-hidden">
      {/* 좌측 Chevron — 항상 DOM에 존재, disabled 시 투명 + 클릭 차단 */}
      <button
        onClick={() => scrollByAmount('left')}
        disabled={!canScrollLeft}
        className={`
          flex-shrink-0 flex items-center justify-center w-6 h-8 mb-0.5
          transition-all duration-150
          ${canScrollLeft
            ? 'text-zinc-400 hover:text-zinc-700 cursor-pointer'
            : 'text-transparent cursor-default pointer-events-none'
          }
        `}
        aria-label="탭 왼쪽 스크롤"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* DnD 컨텍스트: 센서 + 수평 제한 + 드래그 종료 핸들러 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          {/* 스크롤 가능한 탭 영역 */}
          <div
            ref={scrollRef}
            className="flex items-end gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0"
          >
            {tabs.map((tab) => (
              <SortableTabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === selectedTabId}
                isEditing={tab.id === editingTabId}
                editTitle={editTitle}
                tabCount={tabs.length}
                inputRef={inputRef}
                activeTabRef={activeTabRef}
                onSelect={onSelect}
                onStartEditing={startEditing}
                onEditTitleChange={setEditTitle}
                onSaveEdit={saveEdit}
                onKeyDown={handleKeyDown}
                onDeleteRequest={setDeleteTabId}
              />
            ))}

            {/* Virtual System Tab "All" — DB에 없음, 삭제/이름변경 불가, 항상 마지막 */}
            <button
              type="button"
              onClick={() => onSelect(ALL_TAB_ID)}
              className={`
                flex-shrink-0 flex items-center px-3 py-2.5 rounded-t-lg
                min-w-[60px] transition-colors duration-200
                ${selectedTabId === ALL_TAB_ID
                  ? 'bg-zinc-900 text-white font-medium'
                  : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300/70 hover:text-zinc-700'
                }
              `}
            >
              <span className="text-sm">All</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {/* 우측 Chevron — 항상 DOM에 존재, disabled 시 투명 + 클릭 차단 */}
      <button
        onClick={() => scrollByAmount('right')}
        disabled={!canScrollRight}
        className={`
          flex-shrink-0 flex items-center justify-center w-6 h-8 mb-0.5
          transition-all duration-150
          ${canScrollRight
            ? 'text-zinc-400 hover:text-zinc-700 cursor-pointer'
            : 'text-transparent cursor-default pointer-events-none'
          }
        `}
        aria-label="탭 오른쪽 스크롤"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* 새 탭 추가 버튼 */}
      {/* onMouseDown + preventDefault: Desktop에서 기존 input의 blur를 방지 */}
      {/* Mobile에서는 touchstart → blur가 mousedown보다 먼저 발생하므로 영향 없음 */}
      <button
        onMouseDown={(e) => e.preventDefault()}
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
        message={`"${deleteTargetTab?.title ?? ''}" 탭을 삭제하시겠습니까?\n탭에 포함된 할 일은 휴지통으로 이동됩니다.`}
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
