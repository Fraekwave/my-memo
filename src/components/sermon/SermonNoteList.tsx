import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { SermonNote } from '@/lib/types';
import { SermonNoteCard } from './SermonNoteCard';

interface SermonNoteListProps {
  notes: SermonNote[];
  isLoading: boolean;
  onSelectNote: (id: number) => void;
  onNewNote: () => void;
}

export function SermonNoteList({ notes, isLoading, onSelectNote, onNewNote }: SermonNoteListProps) {
  const { t } = useTranslation();

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
        <span className="text-sm font-medium">{t('sermon.newNote')}</span>
      </button>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 text-sm">{t('sermon.noNotes')}</p>
          <p className="text-zinc-300 text-xs mt-1">{t('sermon.noNotesSub')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <SermonNoteCard
              key={note.id}
              note={note}
              onClick={() => onSelectNote(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
