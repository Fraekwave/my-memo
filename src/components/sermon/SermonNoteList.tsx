import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { SermonNote } from '@/lib/types';
import { SermonNoteCard } from './SermonNoteCard';
import {
  restrictToVerticalAxis,
  pointerTrackingCollision,
  SmartMouseSensor,
  SmartTouchSensor,
} from '@/lib/dndUtils';

interface SermonNoteListProps {
  notes: SermonNote[];
  isLoading: boolean;
  onSelectNote: (id: number) => void;
  onNewNote: () => void;
  onDelete: (id: number) => void;
  onReorder: (activeId: number, overId: number) => void;
}

export function SermonNoteList({ notes, isLoading, onSelectNote, onNewNote, onDelete, onReorder }: SermonNoteListProps) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeNote = activeId !== null ? notes.find(n => n.id === activeId) : null;

  const mouseOptions = useMemo(() => ({ activationConstraint: { distance: 10 } }), []);
  const touchOptions = useMemo(() => ({ activationConstraint: { delay: 250, tolerance: 5 } }), []);
  const sensors = useSensors(
    useSensor(SmartMouseSensor, mouseOptions),
    useSensor(SmartTouchSensor, touchOptions)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(Number(active.id), Number(over.id));
    }
    setActiveId(null);
    (document.activeElement as HTMLElement)?.blur?.();
  };

  const handleDragCancel = () => {
    setActiveId(null);
    (document.activeElement as HTMLElement)?.blur?.();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      {/* New Note button */}
      <button
        type="button"
        onClick={onNewNote}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 mb-4 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        <span className="text-base font-medium">{t('sermon.newNote')}</span>
      </button>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 text-base">{t('sermon.noNotes')}</p>
          <p className="text-zinc-300 text-base mt-1">{t('sermon.noNotesSub')}</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerTrackingCollision}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={notes.map(n => n.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {notes.map((note) => (
                <SermonNoteCard
                  key={note.id}
                  note={note}
                  onClick={() => onSelectNote(note.id)}
                  onDelete={onDelete}
                  activeDragId={activeId}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeNote ? (
              <div className="px-4 py-3 rounded-xl border border-zinc-200 shadow-xl select-none cursor-grabbing" style={{ backgroundColor: '#f4f4f4' }}>
                <div className="text-sm text-zinc-400">{activeNote.date}</div>
                {activeNote.topic ? (
                  <div className="text-base font-semibold text-zinc-900 truncate">{activeNote.topic}</div>
                ) : (
                  <div className="text-base font-medium text-zinc-300 italic">제목 없음</div>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
