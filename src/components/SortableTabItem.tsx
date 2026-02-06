import { KeyboardEvent, RefObject } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, X } from 'lucide-react';
import { Tab } from '@/lib/types';

interface SortableTabItemProps {
  tab: Tab;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  tabCount: number;
  inputRef: RefObject<HTMLInputElement>;
  activeTabRef: RefObject<HTMLDivElement>;
  onSelect: (id: number) => void;
  onStartEditing: (tab: Tab) => void;
  onEditTitleChange: (value: string) => void;
  onSaveEdit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onDeleteRequest: (id: number) => void;
}

/**
 * 개별 탭 아이템 — @dnd-kit/sortable 통합
 *
 * useSortable 훅으로 드래그 가능하게 만들고,
 * transform/transition을 inline style로 적용합니다.
 * 드래그 중인 아이템은 시각적으로 구분(opacity, shadow)됩니다.
 */
export const SortableTabItem = ({
  tab,
  isActive,
  isEditing,
  editTitle,
  tabCount,
  inputRef,
  activeTabRef,
  onSelect,
  onStartEditing,
  onEditTitleChange,
  onSaveEdit,
  onKeyDown,
  onDeleteRequest,
}: SortableTabItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  // 수평 이동만 허용 (y: 0), 드래그 중 애니메이션 스타일
  const style = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, y: 0, scaleX: 1, scaleY: 1 } : null
    ),
    transition,
    zIndex: isDragging ? 50 : isActive ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  // activeTabRef 병합: sortable ref + 활성 탭 auto-scroll ref
  const mergedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (isActive) {
      (activeTabRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  return (
    <div
      ref={mergedRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isEditing && !isDragging && onSelect(tab.id)}
      onDoubleClick={() => !isDragging && onStartEditing(tab)}
      className={`
        group relative flex items-center gap-1 px-3 py-2.5
        rounded-t-lg cursor-pointer select-none
        transition-colors duration-200 ease-out
        min-w-[80px] max-w-[200px] flex-shrink-0
        ${isDragging ? 'shadow-lg ring-1 ring-zinc-300/50 rounded-lg' : ''}
        ${
          isActive
            ? 'bg-white text-zinc-900 shadow-sm font-medium'
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
          onChange={(e) => onEditTitleChange(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 bg-transparent border-b border-zinc-400 outline-none text-sm py-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-sm">
          {tab.title}
        </span>
      )}

      {/* 이름 변경 버튼 (Pencil) — 활성 탭에만 표시 */}
      {!isEditing && isActive && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartEditing(tab);
          }}
          className="flex-shrink-0 text-zinc-300 hover:text-zinc-600 transition-colors p-0.5"
          aria-label="탭 이름 변경"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}

      {/* 닫기(X) 버튼 */}
      {!isEditing && tabCount > 1 && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest(tab.id);
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
};
