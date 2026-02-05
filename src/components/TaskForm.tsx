import { useState, FormEvent } from 'react';

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
 * JSX 문법 주의사항:
 * - class → className
 * - <input> → <input /> (self-closing)
 * - onclick → onClick (camelCase)
 */
export const TaskForm = ({ onSubmit }: TaskFormProps) => {
  const [input, setInput] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim()) return;

    // Optimistic UI: 입력창을 먼저 초기화 (즉시 반응)
    const taskText = input;
    setInput('');

    // 백그라운드에서 서버 전송
    const success = await onSubmit(taskText);

    // 실패 시 입력창에 텍스트 복원
    if (!success) {
      setInput(taskText);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 sm:p-8 border-b border-zinc-100">
      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="새로운 할 일을 입력하세요..."
          className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 transition-all focus:bg-white focus:border-zinc-900 outline-none"
          autoComplete="off"
        />
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
