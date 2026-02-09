import { useState, FormEvent, KeyboardEvent } from 'react';
import { useTaskAutocomplete } from '@/hooks/useTaskAutocomplete';

interface TaskFormProps {
  onSubmit: (text: string) => Promise<boolean>;
}

/**
 * Task 입력 폼 컴포넌트
 *
 * ✨ Optimistic UI 적용:
 * - 로딩 상태 없음 (즉시 반응)
 * - 입력창은 항상 활성화
 * - 서버 응답 기다리지 않고 즉시 추가
 *
 * ✨ Local-First Autocomplete (v260210):
 * - Ghost Text: 입력 중 회색 접미사로 자동완성 후보 표시
 * - Tab / ArrowRight(커서 끝)로 제안 수락
 * - IME Composition Guard: 한국어 조합 중 깜빡임 방지
 */
export const TaskForm = ({ onSubmit }: TaskFormProps) => {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const { record, suggest } = useTaskAutocomplete();

  // ── 자동완성 제안 ──
  // IME 조합 중이라도 입력이 2글자 이상이면 제안 허용 (한국어 "핫라" 등)
  // 1글자 조합 중(ㅋ→커)일 때만 차단하여 깜빡임 방지
  const suggestion = isComposing && input.length < 2 ? null : suggest(input);
  const suffix =
    suggestion && suggestion.length > input.length
      ? suggestion.slice(input.length)
      : '';

  // ── 폼 제출 ──
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Optimistic UI: 입력창을 먼저 초기화 (즉시 반응)
    const taskText = input;
    setInput('');

    // 자동완성 히스토리에 기록
    record(taskText);

    // 백그라운드에서 서버 전송
    const success = await onSubmit(taskText);

    // 실패 시 입력창에 텍스트 복원
    if (!success) {
      setInput(taskText);
    }
  };

  // ── 키보드: Tab / ArrowRight로 제안 수락 ──
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestion) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      setInput(suggestion);
    }

    if (e.key === 'ArrowRight') {
      const target = e.currentTarget;
      // 커서가 입력 끝에 있을 때만 수락 (중간이면 일반 커서 이동)
      if (target.selectionStart === target.value.length) {
        e.preventDefault();
        setInput(suggestion);
      }
    }
  };

  // ── IME Composition Guard ──
  // 한국어/일본어/중국어 조합 중 suggest() 호출을 차단하여
  // ㅋ→커→컵 같은 중간 상태에서 Ghost Text가 깜빡이는 현상 방지
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
    // React 18 automatic batching: 이 setState와 다음 onChange의 setInput이
    // 단일 렌더로 병합되어 suggestion이 올바르게 재계산됨
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 sm:p-8 border-b border-zinc-100">
      <div className="flex gap-3">
        {/* ── Autocomplete Wrapper ── */}
        {/* background/border를 wrapper에서 관리, input은 bg-transparent */}
        <div className="relative flex-1 bg-zinc-50 rounded-xl border border-zinc-200 transition-colors focus-within:bg-white focus-within:border-zinc-900">
          {/* Ghost Text Overlay */}
          {suffix && (
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden px-4 py-3"
              aria-hidden="true"
            >
              {/* 입력 텍스트만큼 투명 공간 확보 → 접미사를 정확한 위치에 배치 */}
              <span className="invisible whitespace-pre">{input}</span>
              {/* 자동완성 접미사 (회색) */}
              <span className="text-zinc-300 whitespace-pre">{suffix}</span>
            </div>
          )}

          {/* Actual Input — bg-transparent로 Ghost Text 노출 */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="새로운 할 일을 입력하세요..."
            className="relative w-full px-4 py-3 bg-transparent text-zinc-900 placeholder-zinc-400 outline-none rounded-xl"
            autoComplete="off"
          />
        </div>

        <button
          type="submit"
          disabled={!input.trim()}
          className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all active:scale-95 whitespace-nowrap flex-shrink-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>추가</span>
        </button>
      </div>
    </form>
  );
};
