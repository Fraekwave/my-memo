import { useState, useCallback } from 'react';
import { useSermonNotes } from '@/hooks/useSermonNotes';
import { SermonNoteList } from './SermonNoteList';
import { SermonNoteEditor } from './SermonNoteEditor';
import { SermonTrashView } from './SermonTrashView';

interface SermonModeProps {
  userId: string | null;
  showTrash: boolean;
  onCloseTrash: () => void;
}

export function SermonMode({ userId, showTrash, onCloseTrash }: SermonModeProps) {
  const {
    notes,
    isLoading,
    addNote,
    updateNote,
    deleteNote,
    reorderNotes,
    deletedNotes,
    isTrashLoading,
    fetchDeletedNotes,
    restoreNote,
  } = useSermonNotes(userId);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  const selectedNote = selectedNoteId !== null
    ? notes.find(n => n.id === selectedNoteId) ?? null
    : null;

  const handleNewNote = useCallback(async () => {
    const note = await addNote();
    if (note) setSelectedNoteId(note.id);
  }, [addNote]);

  const handleBack = useCallback(() => {
    setSelectedNoteId(null);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    await deleteNote(id);
  }, [deleteNote]);

  // Trash view
  if (showTrash) {
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 p-6 sm:p-8 min-h-[400px]"
        style={{ backgroundColor: 'var(--surface-card)' }}
      >
        <SermonTrashView
          deletedNotes={deletedNotes}
          isLoading={isTrashLoading}
          onFetch={fetchDeletedNotes}
          onRestore={restoreNote}
          onClose={onCloseTrash}
        />
      </div>
    );
  }

  if (selectedNote) {
    return (
      <div
        className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 min-h-[500px]"
        style={{ backgroundColor: 'var(--surface-card)' }}
      >
        <SermonNoteEditor
          note={selectedNote}
          onUpdate={updateNote}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-lg shadow-stone-200/50 border border-stone-200 p-6 sm:p-8 min-h-[400px]">
      <SermonNoteList
        notes={notes}
        isLoading={isLoading}
        onSelectNote={setSelectedNoteId}
        onNewNote={handleNewNote}
        onDelete={handleDelete}
        onReorder={reorderNotes}
      />
    </div>
  );
}
