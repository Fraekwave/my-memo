import { memo, useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { Task } from '@/lib/types';
import { tryHaptic } from '@/lib/haptic';
import { decomposeToJamoGrouped } from '@/lib/hangulUtils';
import { getTaskAgingStyles } from '@/lib/visualAging';
import { DeconstructionCanvas } from './DeconstructionCanvas';

const COMPLETION_ANIMATION_MS = 400;
const DIRECTION_THRESHOLD = 10;
const AXIS_LOCK_RATIO = 1.5; // |dx| must exceed |dy| by this factor to lock horizontal
const DELETE_DISTANCE_RATIO = 0.38; // 38% — deliberate swipe threshold
const MIN_INTENT_RATIO = 0.28; // 28% — minimum swipe for velocity-based delete (deliberate stroke, not twitch)
const VELOCITY_THRESHOLD = 400; // px/s — fast flick completion
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };

// Single fluidic collapse: tuned spring for 120Hz — magnetic snap, no stage friction
const EXIT_SPRING = {
  type: 'spring' as const,
  stiffness: 180,
  damping: 28,
  mass: 0.7,
};
const EXIT_TRANSITION = EXIT_SPRING;

function colorWithOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function isInteractiveElement(el: EventTarget | null): boolean {
  const tags = new Set(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LABEL']);
  let cur = el as HTMLElement | null;
  while (cur) {
    if (tags.has(cur.tagName) || cur.dataset?.noDnd === 'true') return true;
    cur = cur.parentElement;
  }
  return false;
}

interface TaskItemProps {
  task: Task;
  activeDragId: number | null;
  onToggle: (id: number, isCompleted: boolean) => void;
  onUpdate: (id: number, newText: string) => void;
  onDelete: (id: number) => void;
  disableDrag?: boolean;
}

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

export const TaskItem = memo(({ task, activeDragId, onToggle, onUpdate, onDelete, disableDrag = false }: TaskItemProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [isExpanded, setIsExpanded] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [usePopFallback, setUsePopFallback] = useState(false);
  const [showDeconstruction, setShowDeconstruction] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const swipeWrapperRef = useRef<HTMLDivElement>(null);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [deletingState, setDeletingState] = useState<{ height: number } | null>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastRef = useRef<{ x: number; t: number } | null>(null);
  const velocityHistoryRef = useRef<{ x: number; t: number }[]>([]);
  const modeRef = useRef<'idle' | 'swipe' | 'sort'>('idle');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: task.id, animateLayoutChanges, disabled: disableDrag });

  const aging = useMemo(() => getTaskAgingStyles(task.created_at), [task.created_at]);
  const isDragActive = activeDragId === task.id;
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: sortableTransition,
    opacity: isDragActive ? 0.3 : 1,
    backgroundColor: aging.backgroundColor,
  };

  const dragProps = isEditing || disableDrag ? {} : { ...attributes, ...listeners };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
      el.focus();
      el.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!justCompleted) return;
    completionTimeoutRef.current = setTimeout(() => {
      setJustCompleted(false);
      setUsePopFallback(false);
      completionTimeoutRef.current = null;
    }, COMPLETION_ANIMATION_MS);
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
    };
  }, [justCompleted]);

  const handleToggle = useCallback(
    (checked: boolean) => {
      onToggle(task.id, checked);
      if (checked) {
        const hapticSucceeded = tryHaptic();
        setJustCompleted(true);
        setUsePopFallback(!hapticSucceeded);
        const grouped = decomposeToJamoGrouped(task.text);
        if (grouped.flat().length > 0) setShowDeconstruction(true);
      } else {
        setShowDeconstruction(false);
        setCanvasSize(null);
      }
    },
    [task.id, task.text, onToggle]
  );

  useEffect(() => {
    if (showDeconstruction && textContainerRef.current) {
      const rect = textContainerRef.current.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    } else setCanvasSize(null);
  }, [showDeconstruction]);

  useEffect(() => {
    if (!task.is_completed) {
      setShowDeconstruction(false);
      setCanvasSize(null);
    }
  }, [task.is_completed]);

  const handleDeconstructionComplete = useCallback(() => {
    setShowDeconstruction(false);
    setCanvasSize(null);
  }, []);

  const startEditing = () => {
    setEditText(task.text);
    setIsEditing(true);
  };

  const saveEdit = () => {
    const t = editText.trim();
    if (t && t !== task.text) onUpdate(task.id, t);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditText(task.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  const isDeleting = deletingState !== null;

  // Single tap = expand/collapse (instant), double-tap = edit mode
  const lastTapRef = useRef<number>(0);
  const isLongText = task.text.length > 80 || task.text.includes('\n');

  const handleTextDoubleTap = useCallback((e: React.MouseEvent) => {
    if (isEditing || isDeleting || isDragging || showDeconstruction) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap → edit mode (undo the expand that just happened)
      e.stopPropagation();
      if (isLongText) setIsExpanded(false);
      startEditing();
      lastTapRef.current = 0;
    } else {
      // Single tap → expand/collapse instantly
      lastTapRef.current = now;
      if (isLongText) {
        setIsExpanded(prev => !prev);
      }
    }
  }, [isEditing, isDeleting, isDragging, showDeconstruction, isLongText]);

  const triggerDelete = useCallback(() => {
    if (isDeleting) return;
    const el = contentWrapperRef.current;
    const height = el?.offsetHeight ?? 80;
    setDeletingState({ height });
    tryHaptic();
  }, [isDeleting]);

  const handleDeleteComplete = useCallback(() => {
    onDelete(task.id);
  }, [task.id, onDelete]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isDeleting || isEditing || isDragging || showDeconstruction) return;
      if (isInteractiveElement(e.target)) return;
      // Swipe-to-delete only for touch; mouse/pen use hover delete
      if (e.pointerType !== 'touch') return;
      startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      lastRef.current = { x: e.clientX, t: performance.now() };
      velocityHistoryRef.current = [{ x: e.clientX, t: performance.now() }];
      modeRef.current = 'idle';
      setSwipeOffset(0);
    },
    [isDeleting, isEditing, isDragging, showDeconstruction]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || isDeleting || isEditing || isDragging || showDeconstruction) return;
      if (isInteractiveElement(e.target)) return;

      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (modeRef.current === 'idle' && dist >= DIRECTION_THRESHOLD) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const isHorizontal = absDx > absDy && absDx >= absDy * AXIS_LOCK_RATIO;
        modeRef.current = isHorizontal ? 'swipe' : 'sort';
        if (!isHorizontal) return;
        e.currentTarget instanceof HTMLElement &&
          e.currentTarget.setPointerCapture(e.pointerId);
      }

      if (modeRef.current === 'swipe') {
        e.stopPropagation();
        e.preventDefault();
        const now = performance.now();
        lastRef.current = { x: e.clientX, t: now };
        const hist = velocityHistoryRef.current;
        hist.push({ x: e.clientX, t: now });
        while (hist.length > 1 && now - hist[0].t > 80) hist.shift();
        setSwipeOffset(Math.min(0, dx));
      }
    },
    [isDeleting, isEditing, isDragging, showDeconstruction]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return;
      if (modeRef.current !== 'swipe') {
        startRef.current = null;
        lastRef.current = null;
        velocityHistoryRef.current = [];
        modeRef.current = 'idle';
        return;
      }

      e.stopPropagation();
      const wrapper = swipeWrapperRef.current;
      const width = wrapper?.getBoundingClientRect().width ?? 300;
      const offset = swipeOffset;

      let velocity = 0;
      const hist = velocityHistoryRef.current;
      if (hist.length >= 2) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dt = last.t - first.t;
        if (dt >= 5) velocity = ((last.x - first.x) / dt) * 1000;
      } else if (lastRef.current) {
        const dt = performance.now() - lastRef.current.t;
        if (dt >= 8) velocity = ((e.clientX - lastRef.current.x) / dt) * 1000;
      }

      const pastDistanceThreshold = offset < -width * DELETE_DISTANCE_RATIO;
      const pastIntentThreshold = offset < -width * MIN_INTENT_RATIO;
      const hasFlickVelocity = velocity < -VELOCITY_THRESHOLD;
      const shouldDelete =
        pastDistanceThreshold || (hasFlickVelocity && pastIntentThreshold);

      if (shouldDelete) {
        triggerDelete();
      } else {
        setSwipeOffset(0);
      }

      modeRef.current = 'idle';
      startRef.current = null;
      lastRef.current = null;
      velocityHistoryRef.current = [];
    },
    [swipeOffset, task.id, triggerDelete]
  );


  const completionAnimClass = justCompleted
    ? usePopFallback
      ? 'animate-shake-pop-complete'
      : 'animate-shake-complete'
    : '';

  // Delete reveal: full red during exit; otherwise only when actively swiping
  const progress = isDeleting ? 1 : Math.min(1, Math.abs(swipeOffset) / 120);

  return (
    <motion.div
      ref={setNodeRef}
      layout={!disableDrag ? "position" : false}
      style={{
        ...style,
        ...(isDeleting ? { marginTop: 0, marginBottom: 0 } : {}),
      }}
      transition={
        isDeleting
          ? {
              marginTop: EXIT_TRANSITION,
              marginBottom: EXIT_TRANSITION,
              layout: EXIT_TRANSITION,
            }
          : undefined
      }
      {...dragProps}
      className={`
        task-item group rounded-xl border border-zinc-100
        hover:border-zinc-200 hover:shadow-sm select-none
        ${isEditing ? 'cursor-auto' : 'cursor-grab'}
        ${isDeleting ? 'pointer-events-none' : ''}
      `}
    >
      <motion.div
        ref={contentWrapperRef}
        key={deletingState ? 'exit' : 'idle'}
        initial={
          deletingState
            ? { height: deletingState.height }
            : { height: 'auto' }
        }
        animate={
          deletingState
            ? { height: 0 }
            : { height: 'auto' }
        }
        transition={{
          height: EXIT_TRANSITION,
        }}
        onAnimationComplete={() => {
          if (deletingState) handleDeleteComplete();
        }}
        className="overflow-hidden"
      >
        <div
          ref={swipeWrapperRef}
          className="relative isolate overflow-hidden rounded-xl touch-pan-y"
        onPointerDownCapture={handlePointerDown}
        onPointerMoveCapture={handlePointerMove}
        onPointerUpCapture={handlePointerUp}
        onPointerCancelCapture={handlePointerUp}
      >
        {/* Delete reveal: red bg only during exit (content erased); trash icon during swipe */}
        <div
          className="absolute inset-0 flex items-center justify-end pr-4 rounded-xl"
          style={{
            backgroundColor: `rgba(239, 68, 68, ${progress * 0.95})`,
          }}
          aria-hidden
        >
          <Trash2
            className="w-6 h-6 text-white"
            style={{
              opacity: isDeleting ? 0 : Math.min(1, progress * 1.2),
              transition: isDeleting ? 'none' : undefined,
            }}
          />
        </div>

        {/* Card content: hidden immediately on commit (opacity avoids layout jump) */}
        <motion.div
          className={`
            relative z-10 flex items-center gap-3 p-4 w-full min-w-0
            ${completionAnimClass}
          `}
          style={{
            backgroundColor: aging.backgroundColor,
            opacity: isDeleting ? 0 : 1,
            pointerEvents: isDeleting ? 'none' : 'auto',
            transition: isDeleting ? 'none' : undefined,
          }}
          animate={{ x: swipeOffset }}
          transition={SPRING}
        >
          <input
            type="checkbox"
            className="task-checkbox"
            style={{
              borderColor: colorWithOpacity(aging.textColor, 0.3),
              ...(task.is_completed && {
                backgroundColor: colorWithOpacity(aging.textColor, 0.5),
                '--checkbox-check': aging.isDark ? '#18181b' : 'white',
              }),
            }}
            checked={task.is_completed}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={isEditing || isDragging}
          />

          <div
            ref={textContainerRef}
            className="relative flex-1 min-w-0 flex flex-col gap-0.5 min-h-[2rem] justify-center"
          >
            {isEditing ? (
              <textarea
                ref={textareaRef}
                name="task_text"
                value={editText}
                onChange={handleTextareaChange}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                rows={1}
                className="w-full p-0 bg-transparent border-0 outline-none select-text resize-none overflow-hidden leading-normal"
                style={{ fontSize: 'inherit', color: aging.textColor }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            ) : (
              <>
                <div
                  className={`block select-none task-markdown ${task.is_completed ? 'completed' : ''} ${isLongText && !isExpanded ? 'task-markdown-collapsed' : ''}`}
                  style={{
                    color: aging.textColor,
                    opacity: showDeconstruction ? 0 : 1,
                    visibility: showDeconstruction ? 'hidden' : 'visible',
                  }}
                  onClick={handleTextDoubleTap}
                  aria-hidden={showDeconstruction}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkBreaks]}
                    components={{
                      // Open links in new tab
                      a: ({ children, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                      ),
                      // Prevent nesting block-level <p> inside our div causing layout issues
                      p: ({ children }) => <span className="block">{children}</span>,
                    }}
                  >
                    {/* Preserve multiple blank lines: fill empty lines with zero-width space
                        so remark-breaks converts each \n into a visible <br> */}
                    {task.text.replace(/\n(\s*\n)+/g, (match) => {
                      const breaks = match.split('\n').length - 1;
                      return '\n' + '\u200B\n'.repeat(breaks - 1);
                    })}
                  </ReactMarkdown>
                </div>
                {showDeconstruction &&
                  canvasSize &&
                  task.is_completed && (
                    <DeconstructionCanvas
                      text={task.text}
                      width={Math.round(canvasSize.width)}
                      height={Math.round(canvasSize.height)}
                      textColor={aging.textColor}
                      onComplete={handleDeconstructionComplete}
                    />
                  )}
              </>
            )}
          </div>

          {!isEditing && !isDragging && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); triggerDelete(); }}
              data-no-dnd="true"
              className={`
                hidden hover-hover:flex items-center justify-center
                flex-shrink-0 p-1
                opacity-0 group-hover:opacity-100
                pointer-events-none group-hover:pointer-events-auto
                transition-opacity duration-200
                ${aging.isDark ? 'text-white/40 hover:text-white' : 'text-zinc-300 hover:text-red-500'}
              `}
              aria-label={t('tasks.ariaDelete')}
            >
              <Trash2 className="w-4 h-4 flex-shrink-0" />
            </button>
          )}
        </motion.div>
      </div>
      </motion.div>
    </motion.div>
  );
}, (prev, next) =>
  prev.task.id === next.task.id &&
  prev.task.text === next.task.text &&
  prev.task.is_completed === next.task.is_completed &&
  prev.task.order_index === next.task.order_index &&
  prev.task.created_at === next.task.created_at &&
  prev.task.completed_at === next.task.completed_at &&
  prev.activeDragId === next.activeDragId &&
  prev.disableDrag === next.disableDrag &&
  prev.onToggle === next.onToggle &&
  prev.onUpdate === next.onUpdate &&
  prev.onDelete === next.onDelete
);
