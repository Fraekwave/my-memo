import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type AuthMode = 'login' | 'signup';

interface AuthProps {
  onSuccess: () => void;
}

/**
 * Apple-style Email/Password Auth
 * - Minimalist design, refined zinc borders
 * - Smooth transitions (200ms)
 */
export const Auth = ({ onSuccess }: AuthProps) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        onSuccess();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증 실패');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'signup' : 'login'));
    setError(null);
  };

  return (
    <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-zinc-50">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-light text-zinc-900 tracking-tight text-center mb-2">
          Today&apos;s Tasks
        </h1>
        <p className="text-zinc-500 text-sm font-light text-center mb-8">
          {mode === 'login' ? '로그인하여 시작하세요' : '새 계정 만들기'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-900 transition-colors duration-200"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-900 transition-colors duration-200"
          />

          {error && (
            <p className="text-red-500 text-sm font-light">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          className="w-full mt-4 py-2 text-zinc-500 text-sm font-light hover:text-zinc-700 transition-colors duration-200"
        >
          {mode === 'login' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  );
};
