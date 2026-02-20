import { memo, useState, useRef, useEffect, useCallback, FormEvent, KeyboardEvent, TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskAutocomplete } from '@/hooks/useTaskAutocomplete';

interface TaskFormProps {
  onSubmit: (text: string) => Promise<boolean>;
  /** True when the user is on ALL_TAB_ID (cannot target a specific tab). */
  disabled?: boolean;
  /** True when the user has reached their max_tasks quota. */
  isAtTaskLimit?: boolean;
}

/**
 * Task 입력 폼 컴포넌트
 *
 * ✨ Optimistic UI 적용:
 * - 로딩 상태 없음 (즉시 반응)
 * - 입력창은 항상 활성화
 * - 서버 응답 기다리지 않고 즉시 추가
 *
 * ✨ Local-First Autocomplete:
 * - Ghost Text: 입력 중 회색 접미사로 자동완성 후보 표시
 * - Desktop: Tab / ArrowRight(커서 끝)로 제안 수락
 * - Mobile: Swipe Right (50px+) 제스처로 제안 수락
 * - IME Composition Guard: 한국어 조합 중 깜빡임 방지
 *
 * ✨ One-Time Coach Mark:
 * - 모바일에서 첫 제안 출현 시 "→ 밀어서 완성" 힌트 1회 표시
 * - 3초 후 자동 소멸 또는 스와이프 시 즉시 소멸
 * - localStorage로 영구 dismiss 관리
 */

const HINT_STORAGE_KEY = 'has_seen_swipe_hint';
const SWIPE_THRESHOLD = 50; // px — 의도적 스와이프와 탭/미세 터치 구분

export const TaskForm = memo(({
  onSubmit,
  disabled = false,
  isAtTaskLimit = false,
}: TaskFormProps) => {
  const { t } = useTranslation();
  const isDisabled = disabled || isAtTaskLimit;

  // Priority: quota message > All-tab message > default placeholder
  const placeholder = isAtTaskLimit
    ? t('tasks.placeholderLimit')
    : disabled
      ? t('tasks.placeholderAllTab')
      : t('tasks.placeholder');
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const { record, suggest, onAcceptSuggestion, checkRejection } = useTaskAutocomplete();

  // ── 자동완성 제안 ──
  const suggestion = isComposing && input.length < 2 ? null : suggest(input);
  const suffix =
    suggestion && suggestion.length > input.length
      ? suggestion.slice(input.length)
      : '';

  // ── Swipe Detection ──
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Force IME commit before setInput to prevent ghost character appending
  const acceptSuggestionSafely = useCallback(
    (value: string) => {
      const el = inputRef.current;
      if (el) {
        el.blur();
        setTimeout(() => {
          el.focus();
          onAcceptSuggestion(value);
          setInput(value);
        }, 0);
      } else {
        onAcceptSuggestion(value);
        setInput(value);
      }
    },
    [onAcceptSuggestion]
  );

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !suggestion) {
      touchStartRef.current = null;
      return;
    }

    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y);

    // Swipe Right: 수평 이동 > 50px AND 수평 > 수직 (스크롤 아닌 의도적 스와이프)
    if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY) {
      acceptSuggestionSafely(suggestion);
      dismissHint();
    }

    touchStartRef.current = null;
  };

  // ── One-Time Coach Mark ──
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const hasSeenHint = useRef(
    typeof window !== 'undefined' &&
      localStorage.getItem(HINT_STORAGE_KEY) === 'true'
  );

  const dismissHint = () => {
    setShowSwipeHint(false);
    if (!hasSeenHint.current) {
      localStorage.setItem(HINT_STORAGE_KEY, 'true');
      hasSeenHint.current = true;
    }
  };

  useEffect(() => {
    // 제안이 사라지면 힌트도 숨김
    if (!suggestion) {
      setShowSwipeHint(false);
      return;
    }

    // 이미 본 유저에게는 다시 표시하지 않음
    if (hasSeenHint.current) return;

    // 터치 디바이스에서만 표시
    const isTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    setShowSwipeHint(true);

    // 3초 후 자동 dismiss (CSS 애니메이션과 동기화)
    const timer = setTimeout(() => {
      dismissHint();
    }, 3000);

    return () => clearTimeout(timer);
  }, [suggestion]);

  // ── 폼 제출 ──
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim()) return;

      const taskText = input;
      setInput('');

      record(taskText);

      const success = await onSubmit(taskText);
      if (!success) {
        setInput(taskText);
      }
    },
    [input, onSubmit, record]
  );

  // ── 키보드: Tab / ArrowRight로 제안 수락 (IME composition commit before setInput) ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!suggestion) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestionSafely(suggestion);
      }

      if (e.key === 'ArrowRight') {
        const target = e.currentTarget;
        if (target.selectionStart === target.value.length) {
          e.preventDefault();
          acceptSuggestionSafely(suggestion);
        }
      }
    },
    [suggestion, acceptSuggestionSafely]
  );

  // ── IME Composition Guard ──
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="p-6 sm:p-8 border-b border-zinc-100">
      <div className="flex gap-3">
        {/* ── Autocomplete Wrapper ── */}
        {/* Touch handlers on wrapper for swipe detection */}
        <div
          className="relative flex-1 bg-zinc-50 rounded-xl border border-zinc-200 transition-colors focus-within:bg-white focus-within:border-zinc-900"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Ghost Text Overlay */}
          {suffix && (
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden px-4 py-3"
              aria-hidden="true"
            >
              <span className="invisible whitespace-pre">{input}</span>
              <span className="text-zinc-300 whitespace-pre">{suffix}</span>
            </div>
          )}

          {/* One-Time Swipe Coach Mark */}
          {showSwipeHint && (
            <div
              className="absolute inset-y-0 right-3 flex items-center pointer-events-none animate-swipe-hint"
              aria-hidden="true"
            >
              <span className="text-[11px] text-zinc-400 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                <span className="animate-nudge-right">→</span>
                {t('tasks.swipeHint')}
              </span>
            </div>
          )}

          {/* Standard input — basic clean attributes */}
          <input
            ref={inputRef}
            type="text"
            name="task_text"
            value={input}
            disabled={isDisabled}
            onChange={(e) => {
              const next = e.target.value;
              checkRejection(input, next);
              setInput(next);
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={placeholder}
            className="relative w-full px-4 py-3 bg-transparent text-zinc-900 placeholder-zinc-400 outline-none rounded-xl"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <button
          type="submit"
          disabled={isDisabled || !input.trim()}
          className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all active:scale-95 whitespace-nowrap flex-shrink-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{t('common.add')}</span>
        </button>
      </div>
    </form>
  );
});
