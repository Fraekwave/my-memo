import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { ArrowLeft, Copy, Eye, Edit3 } from 'lucide-react';
import { SermonNote } from '@/lib/types';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useBible } from '@/hooks/useBible';
import { detectPartialBibleRef } from '@/lib/bibleParser';
import { formatSermonNote } from '@/lib/formatSermonNote';
import { SermonHeader } from './SermonHeader';

interface SermonNoteEditorProps {
  note: SermonNote;
  onUpdate: (id: number, updates: Partial<Pick<SermonNote, 'pastor' | 'topic' | 'bible_ref' | 'content'>>) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onBack: () => void;
}

export function SermonNoteEditor({ note, onUpdate, onDelete, onBack }: SermonNoteEditorProps) {
  const { t } = useTranslation();
  const { formatInsertText } = useBible();

  const [pastor, setPastor] = useState(note.pastor);
  const [topic, setTopic] = useState(note.topic);
  const [bibleRef, setBibleRef] = useState(note.bible_ref);
  const [content, setContent] = useState(note.content);
  const [showPreview, setShowPreview] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && !showPreview) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = Math.max(el.scrollHeight, 300) + 'px';
    }
  }, [content, showPreview]);

  // Auto-save
  const { trigger: triggerSave, saveStatus } = useAutoSave(
    useCallback(async () => {
      return onUpdate(note.id, { pastor, topic, bible_ref: bibleRef, content });
    }, [note.id, pastor, topic, bibleRef, content, onUpdate]),
    2000
  );

  // Trigger save on any field change
  const updatePastor = (v: string) => { setPastor(v); triggerSave(); };
  const updateTopic = (v: string) => { setTopic(v); triggerSave(); };
  const updateBibleRef = (v: string) => { setBibleRef(v); triggerSave(); };

  const handleContentChange = useCallback(async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setContent(newValue);
    triggerSave();

    // Detect @bible reference followed by space
    const ref = detectPartialBibleRef(newValue);
    if (ref) {
      const insertText = await formatInsertText(ref);
      if (insertText) {
        // Replace the @reference with the bible text
        const replaced = newValue.replace(ref.raw + ' ', insertText);
        setContent(replaced);
        triggerSave();
      }
    }
  }, [triggerSave, formatInsertText]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    const currentNote: SermonNote = { ...note, pastor, topic, bible_ref: bibleRef, content };
    const text = formatSermonNote(currentNote);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  }, [note, pastor, topic, bibleRef, content]);

  // Delete note
  const handleDelete = useCallback(async () => {
    const ok = await onDelete(note.id);
    if (ok) onBack();
  }, [note.id, onDelete, onBack]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-3 border-b border-zinc-100">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors p-1.5 -ml-1.5 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex items-center gap-1">
          {/* Save status */}
          <span className="text-xs text-zinc-400 mr-2">
            {saveStatus === 'saving' && t('sermon.saving')}
            {saveStatus === 'saved' && t('sermon.saved')}
          </span>

          {/* Preview toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`p-2 rounded-lg transition-colors ${showPreview ? 'text-zinc-700 bg-zinc-100' : 'text-zinc-400 hover:text-zinc-600'}`}
            aria-label={showPreview ? 'Edit' : 'Preview'}
          >
            {showPreview ? <Edit3 className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors rounded-lg"
            aria-label={t('sermon.copy')}
          >
            {copyFeedback ? (
              <span className="text-xs text-green-500 font-medium">{t('sermon.copied')}</span>
            ) : (
              <Copy className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <SermonHeader
          date={note.date}
          pastor={pastor}
          topic={topic}
          bibleRef={bibleRef}
          onPastorChange={updatePastor}
          onTopicChange={updateTopic}
          onBibleRefChange={updateBibleRef}
        />

        {showPreview ? (
          <div className="mt-4 prose prose-zinc prose-sm max-w-none task-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                ),
                p: ({ children }) => <span className="block mb-2">{children}</span>,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="mt-4">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder={t('sermon.contentPlaceholder')}
              className="w-full bg-transparent text-zinc-800 placeholder-zinc-300 outline-none resize-none leading-relaxed text-sm min-h-[300px]"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Delete button at bottom */}
      <div className="px-4 py-3 border-t border-zinc-100">
        {showDeleteConfirm ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-500">{t('sermon.deleteConfirm')}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="text-xs text-zinc-500 hover:text-zinc-700 px-3 py-1.5 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
          >
            {t('sermon.deleteNote')}
          </button>
        )}
      </div>
    </div>
  );
}
