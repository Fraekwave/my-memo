import { useState, useRef, useCallback } from 'react';
import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { SermonNote } from '@/lib/types';
import { isInteractiveElement } from '@/lib/dndUtils';

const DELETE_DISTANCE_RATIO = 0.38;
const MIN_INTENT_RATIO = 0.28;
const VELOCITY_THRESHOLD = 400;
const DIRECTION_THRESHOLD = 10;
const AXIS_LOCK_RATIO = 1.5;
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };
const EXIT_SPRING = { type: 'spring' as const, stiffness: 180, damping: 28, mass: 0.7 };

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

interface SermonNoteCardProps {
  note: SermonNote;
  onClick: () => void;
  onDelete: (id: number) => void;
  activeDragId: number | null;
}

export function SermonNoteCard({ note, onClick, onDelete, activeDragId }: SermonNoteCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, animateLayoutChanges });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const preview = note.content.length > 80
    ? note.content.slice(0, 80) + '...'
    : note.content;

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [deletingState, setDeletingState] = useState<{ height: number } | null>(null);
  const isDeleting = deletingState !== null;

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastRef = useRef<{ x: number; t: number } | null>(null);
  const velocityHistoryRef = useRef<{ x: number; t: number }[]>([]);
  const modeRef = useRef<'idle' | 'swipe' | 'sort'>('idle');
  const swipeWrapperRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);

  const triggerDelete = useCallback(() => {
    const el = contentWrapperRef.current;
    const height = el?.offsetHeight ?? 80;
    setDeletingState({ height });
  }, []);

  const handleDeleteComplete = useCallback(() => {
    onDelete(note.id);
  }, [note.id, onDelete]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isDeleting || isDragging) return;
      if (isInteractiveElement(e.target as HTMLElement)) return;
      if (e.pointerType !== 'touch') return;
      startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      lastRef.current = { x: e.clientX, t: performance.now() };
      velocityHistoryRef.current = [{ x: e.clientX, t: performance.now() }];
      modeRef.current = 'idle';
      setSwipeOffset(0);
    },
    [isDeleting, isDragging]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || isDeleting || isDragging) return;

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
    [isDeleting, isDragging]
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
      const shouldDelete = pastDistanceThreshold || (hasFlickVelocity && pastIntentThreshold);

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
    [swipeOffset, triggerDelete]
  );

  const progress = isDeleting ? 1 : Math.min(1, Math.abs(swipeOffset) / 120);

  const dragProps = activeDragId === null ? { ...attributes, ...listeners } : {};

  return (
    <motion.div
      ref={setNodeRef}
      layout="position"
      style={{
        ...style,
        ...(isDeleting ? { marginTop: 0, marginBottom: 0 } : {}),
      }}
      transition={isDeleting ? { layout: EXIT_SPRING } : undefined}
      {...dragProps}
      className={`
        rounded-xl border border-zinc-100 select-none cursor-grab
        ${isDeleting ? 'pointer-events-none' : ''}
      `}
    >
      <motion.div
        ref={contentWrapperRef}
        key={deletingState ? 'exit' : 'idle'}
        initial={deletingState ? { height: deletingState.height } : { height: 'auto' }}
        animate={deletingState ? { height: 0 } : { height: 'auto' }}
        transition={{ height: EXIT_SPRING }}
        onAnimationComplete={() => { if (deletingState) handleDeleteComplete(); }}
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
          {/* Delete reveal background */}
          <div
            className="absolute inset-0 flex items-center justify-end pr-4 rounded-xl"
            style={{ backgroundColor: `rgba(239, 68, 68, ${progress * 0.95})` }}
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

          {/* Card content */}
          <motion.div
            className="relative z-10 w-full text-left p-4 bg-white group flex items-center gap-2"
            style={{
              opacity: isDeleting ? 0 : 1,
              pointerEvents: isDeleting ? 'none' : 'auto',
              transition: isDeleting ? 'none' : undefined,
            }}
            animate={{ x: swipeOffset }}
            transition={SPRING}
            onClick={modeRef.current === 'idle' && !isDeleting ? onClick : undefined}
          >
            <div className="flex-1 min-w-0">
              {/* Date */}
              <div className="text-base text-zinc-400 font-medium mb-1.5">{note.date}</div>

              {/* Topic */}
              {note.topic ? (
                <div className="text-base font-semibold text-black mb-1 truncate">{note.topic}</div>
              ) : (
                <div className="text-base font-medium text-zinc-300 italic mb-1">제목 없음</div>
              )}

              {/* Pastor + Bible Ref */}
              <div className="flex items-center gap-2 text-base text-zinc-400 mb-2">
                {note.pastor && <span>{note.pastor}</span>}
                {note.pastor && note.bible_ref && <span>·</span>}
                {note.bible_ref && <span>{note.bible_ref}</span>}
              </div>

              {/* Content preview */}
              {preview && (
                <div className="text-base text-black leading-relaxed line-clamp-2">{preview}</div>
              )}
            </div>

            {/* Hover delete (PC only) */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); triggerDelete(); }}
              data-no-dnd="true"
              className="
                hidden hover-hover:flex items-center justify-center
                flex-shrink-0 p-1
                opacity-0 group-hover:opacity-100
                pointer-events-none group-hover:pointer-events-auto
                transition-opacity duration-200
                text-zinc-300 hover:text-red-500
              "
              aria-label="Delete"
            >
              <Trash2 className="w-4 h-4 flex-shrink-0" />
            </button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
