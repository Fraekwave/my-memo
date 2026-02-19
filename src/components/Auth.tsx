import { useState, FormEvent, useCallback } from 'react';
import { Globe, Apple, MessageCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AuthMode = 'login' | 'signup';
type SocialProvider = 'google' | 'apple' | 'kakao';

interface AuthProps {
  onSuccess: () => void;
}

// Monochrome icons (zinc scale, no brand colors)
const iconClass = 'w-5 h-5 text-zinc-500';

/**
 * Tesla-style Auth: Extreme minimalism, Zinc/Stone monochrome
 * - Professional typography, no brand colors
 * - Social login via Supabase OAuth
 */
export const Auth = ({ onSuccess }: AuthProps) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoadingProvider, setSocialLoadingProvider] = useState<SocialProvider | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
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
    },
    [mode, email, password, onSuccess]
  );

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'login' ? 'signup' : 'login'));
    setError(null);
  }, []);

  const handleSocialLogin = useCallback(async (provider: SocialProvider) => {
    setError(null);
    setSocialLoadingProvider(provider);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : '소셜 로그인 실패');
    } finally {
      setSocialLoadingProvider(null);
    }
  }, []);

  return (
    <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-stone-50">
      <div className="w-full max-w-sm relative">
        <h1 className="text-3xl font-light text-zinc-900 tracking-tight text-center mb-1">
          Today&apos;s Tasks
        </h1>
        <p className="text-stone-500 text-sm font-light text-center mb-8 tracking-wide">
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
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
          />

          {error && (
            <p className="text-zinc-600 text-sm font-light">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        {/* OR Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-zinc-200" />
          <span className="text-stone-400 text-xs font-light tracking-widest uppercase">또는</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        {/* Social Login */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleSocialLogin('google')}
            disabled={socialLoadingProvider !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-transparent border border-zinc-200 rounded-xl text-zinc-700 hover:bg-zinc-50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {socialLoadingProvider === 'google' ? (
              <Loader2 className={`${iconClass} animate-spin`} strokeWidth={1.5} />
            ) : (
              <Globe className={iconClass} strokeWidth={1.5} />
            )}
            <span className="text-sm font-medium">
              {socialLoadingProvider === 'google' ? '연결 중...' : 'Google로 계속하기'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSocialLogin('apple')}
            disabled={socialLoadingProvider !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-transparent border border-zinc-200 rounded-xl text-zinc-700 hover:bg-zinc-50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {socialLoadingProvider === 'apple' ? (
              <Loader2 className={`${iconClass} animate-spin`} strokeWidth={1.5} />
            ) : (
              <Apple className={iconClass} strokeWidth={1.5} />
            )}
            <span className="text-sm font-medium">
              {socialLoadingProvider === 'apple' ? '연결 중...' : 'Apple로 계속하기'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSocialLogin('kakao')}
            disabled={socialLoadingProvider !== null}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-transparent border border-zinc-200 rounded-xl text-zinc-700 hover:bg-zinc-50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {socialLoadingProvider === 'kakao' ? (
              <Loader2 className={`${iconClass} animate-spin`} strokeWidth={1.5} />
            ) : (
              <MessageCircle className={iconClass} strokeWidth={1.5} />
            )}
            <span className="text-sm font-medium">
              {socialLoadingProvider === 'kakao' ? '연결 중...' : '카카오로 계속하기'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={toggleMode}
          className="w-full mt-6 py-2 text-stone-500 text-sm font-light hover:text-zinc-700 transition-colors duration-200"
        >
          {mode === 'login' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  );
};
