import { SermonNote } from '@/lib/types';

interface SermonNoteCardProps {
  note: SermonNote;
  onClick: () => void;
}

export function SermonNoteCard({ note, onClick }: SermonNoteCardProps) {
  const preview = note.content.length > 80
    ? note.content.slice(0, 80) + '...'
    : note.content;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all bg-white group"
    >
      {/* Date */}
      <div className="text-xs text-zinc-400 font-medium mb-1.5">{note.date}</div>

      {/* Topic (title) */}
      {note.topic ? (
        <div className="text-sm font-semibold text-zinc-900 mb-1 truncate">{note.topic}</div>
      ) : (
        <div className="text-sm font-medium text-zinc-300 italic mb-1">제목 없음</div>
      )}

      {/* Pastor + Bible Ref */}
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
        {note.pastor && <span>{note.pastor}</span>}
        {note.pastor && note.bible_ref && <span>·</span>}
        {note.bible_ref && <span>{note.bible_ref}</span>}
      </div>

      {/* Content preview */}
      {preview && (
        <div className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{preview}</div>
      )}
    </button>
  );
}
