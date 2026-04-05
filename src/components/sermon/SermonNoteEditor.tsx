import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { ArrowLeft, Copy, Eye, Edit3 } from 'lucide-react';
import { SermonNote } from '@/lib/types';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useBible } from '@/hooks/useBible';
import { detectBibleRefBeforeCursor, parseBareRef } from '@/lib/bibleParser';
import { formatSermonNote } from '@/lib/formatSermonNote';
import { SermonHeader } from './SermonHeader';

interface SermonNoteEditorProps {
  note: SermonNote;
  onUpdate: (id: number, updates: Partial<Pick<SermonNote, 'pastor' | 'topic' | 'bible_ref' | 'content'>>) => Promise<boolean>;
  onBack: () => void;
}

export function SermonNoteEditor({ note, onUpdate, onBack }: SermonNoteEditorProps) {
  const { t } = useTranslation();
  const { formatInsertText } = useBible();

  const [pastor, setPastor] = useState(note.pastor);
  const [topic, setTopic] = useState(note.topic);
  const [bibleRef, setBibleRef] = useState(note.bible_ref);
  const [content, setContent] = useState(note.content);
  const [showPreview, setShowPreview] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea — grow only; shrink on blur to avoid cursor jump
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || showPreview) return;
    if (el.scrollHeight > el.clientHeight) {
      el.style.height = el.scrollHeight + 'px';
    }
  }, [content, showPreview]);

  // Full recalc on initial mount and when switching from preview to edit
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || showPreview) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 300) + 'px';
  }, [showPreview]);

  // Auto-save
  const { trigger: triggerSave, saveStatus } = useAutoSave(
    useCallback(async () => {
      return onUpdate(note.id, { pastor, topic, bible_ref: bibleRef, content });
    }, [note.id, pastor, topic, bibleRef, content, onUpdate]),
    2000
  );

  // Track last bible ref that was auto-inserted from header to avoid duplicates
  const lastInsertedRef = useRef<string>('');

  // Trigger save on any field change
  const updatePastor = (v: string) => { setPastor(v); triggerSave(); };
  const updateTopic = (v: string) => { setTopic(v); triggerSave(); };
  const updateBibleRef = (v: string) => { setBibleRef(v); triggerSave(); };

  // Header bible_ref commit: only on Enter or blur
  const commitBibleRef = useCallback(async (v: string) => {
    const ref = parseBareRef(v);
    if (ref && v !== lastInsertedRef.current) {
      const insertText = await formatInsertText(ref);
      if (insertText) {
        lastInsertedRef.current = v;
        setContent(prev => insertText.trimStart() + '\n' + prev);
        triggerSave();
      }
    }
  }, [triggerSave, formatInsertText]);

  // Simple content change — no bible detection here (moved to keydown)
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    triggerSave();
  }, [triggerSave]);

  // Bible @-command: detect on Space or Enter keydown
  const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;

    const el = e.currentTarget;
    const cursorPos = el.selectionStart;
    const text = el.value;

    const ref = detectBibleRefBeforeCursor(text, cursorPos);
    if (!ref) return;

    const insertText = await formatInsertText(ref);
    if (!insertText) return;

    e.preventDefault();

    // Replace @ref with bible text
    const before = text.slice(0, cursorPos - ref.raw.length);
    const after = text.slice(cursorPos);
    const newContent = before + insertText + after;
    setContent(newContent);
    triggerSave();

    // Place cursor after inserted text
    requestAnimationFrame(() => {
      const newPos = before.length + insertText.length;
      el.setSelectionRange(newPos, newPos);
    });
  }, [formatInsertText, triggerSave]);

  // Shrink textarea on blur (safe — no scroll jump since keyboard is dismissing)
  const handleBlur = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 300) + 'px';
  }, []);

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
          onBibleRefCommit={commitBibleRef}
        />

        <div className="mt-4 min-h-[300px]">
          {showPreview ? (
            <div className="text-base text-black leading-relaxed task-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkBreaks]}
                components={{
                  a: ({ children, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{children}</a>
                  ),
                  p: ({ children }) => <span className="block mb-2">{children}</span>,
                  h1: ({ children }) => <h1 className="text-2xl font-bold mb-2 mt-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-bold mb-2 mt-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold mb-1 mt-2">{children}</h3>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-0.5">{children}</li>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-zinc-300 pl-3 italic text-zinc-600 mb-2">{children}</blockquote>,
                  code: ({ children }) => <code className="bg-zinc-100 px-1 py-0.5 rounded text-sm">{children}</code>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={t('sermon.contentPlaceholder')}
              className="w-full bg-transparent text-black placeholder-zinc-300 outline-none resize-none leading-relaxed text-base min-h-[300px]"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          )}
        </div>
      </div>

    </div>
  );
}
