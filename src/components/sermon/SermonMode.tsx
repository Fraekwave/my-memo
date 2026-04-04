import { useState, useCallback } from 'react';
import { useSermonNotes } from '@/hooks/useSermonNotes';
import { SermonNoteList } from './SermonNoteList';
import { SermonNoteEditor } from './SermonNoteEditor';

interface SermonModeProps {
  userId: string | null;
}

export function SermonMode({ userId }: SermonModeProps) {
  const { notes, isLoading, addNote, updateNote, deleteNote } = useSermonNotes(userId);
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

  if (selectedNote) {
    return (
      <div className="bg-white rounded-3xl shadow-lg shadow-zinc-200/50 border border-zinc-200 min-h-[500px]">
        <SermonNoteEditor
          note={selectedNote}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-lg shadow-zinc-200/50 border border-zinc-200 p-6 sm:p-8 min-h-[400px]">
      <SermonNoteList
        notes={notes}
        isLoading={isLoading}
        onSelectNote={setSelectedNoteId}
        onNewNote={handleNewNote}
      />
    </div>
  );
}
