import { useState, FormEvent, useCallback, useMemo } from 'react';
import { Globe, Apple, MessageCircle, Loader2, Check, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AuthMode = 'login' | 'signup';
type SocialProvider = 'google' | 'apple' | 'kakao';

interface AuthProps {
  onSuccess: () => void;
}

const PASSWORD_CRITERIA: { label: string; test: (p: string) => boolean }[] = [
  { label: '최소 8자 이상', test: (p) => p.length >= 8 },
  { label: '대문자 포함', test: (p) => /[A-Z]/.test(p) },
  { label: '소문자 포함', test: (p) => /[a-z]/.test(p) },
  { label: '숫자 포함', test: (p) => /[0-9]/.test(p) },
  { label: '특수문자 포함', test: (p) => /[@&$%#*()\-_+=.,!?;:'"\\/[\]{}^`~]/.test(p) },
];

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isSignedUp, setIsSignedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
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
          setIsSignedUp(true);
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
    setConfirmPassword('');
    setShowResetFlow(false);
    setResetSuccess(false);
    setIsSignedUp(false);
  }, []);

  const toggleShowPassword = useCallback(() => setShowPassword((p) => !p), []);

  const passwordsMatch = useMemo(
    () => confirmPassword === '' || password === confirmPassword,
    [password, confirmPassword]
  );

  const handleResetPassword = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;
      setError(null);
      setResetLoading(true);
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setResetSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : '재설정 메일 발송 실패');
      } finally {
        setResetLoading(false);
      }
    },
    [email]
  );

  const passwordChecks = useMemo(
    () => PASSWORD_CRITERIA.map(({ label, test }) => ({ label, met: test(password) })),
    [password]
  );
  const allPasswordCriteriaMet = useMemo(
    () => passwordChecks.every((c) => c.met),
    [passwordChecks]
  );

  const canSignUp = useMemo(
    () =>
      allPasswordCriteriaMet &&
      confirmPassword.length > 0 &&
      password === confirmPassword,
    [allPasswordCriteriaMet, password, confirmPassword]
  );

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

  if (isSignedUp) {
    return (
      <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-stone-50">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-light text-zinc-900 tracking-tight mb-4">
            메일함을 확인해 주세요
          </h1>
          <p className="text-zinc-600 text-sm font-light leading-relaxed mb-8">
            입력하신 이메일로 인증 링크를 보냈습니다. 링크를 클릭하면 가입이 완료됩니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSignedUp(false);
              setMode('login');
            }}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99]"
          >
            로그인 화면으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-stone-50">
      <div className="w-full max-w-sm relative">
        <h1 className="text-3xl font-light text-zinc-900 tracking-tight text-center mb-1">
          Today&apos;s Tasks
        </h1>
        <p className="text-stone-500 text-sm font-light text-center mb-8 tracking-wide">
          {showResetFlow
            ? '비밀번호 재설정'
            : mode === 'login'
              ? '로그인하여 시작하세요'
              : '새 계정 만들기'}
        </p>

        {showResetFlow ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="가입한 이메일 주소"
              required
              autoComplete="email"
              className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
            />
            {error && <p className="text-zinc-600 text-sm font-light">{error}</p>}
            {resetSuccess && (
              <p className="text-zinc-800 text-sm font-medium">
                비밀번호 재설정 메일이 발송되었습니다.
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowResetFlow(false);
                  setResetSuccess(false);
                  setError(null);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-3 border border-zinc-200 rounded-xl text-zinc-600 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                뒤로
              </button>
              <button
                type="submit"
                disabled={resetLoading || resetSuccess}
                className="flex-1 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetLoading ? '발송 중...' : resetSuccess ? '발송 완료' : '재설정 메일 받기'}
              </button>
            </div>
          </form>
        ) : (
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
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full px-4 py-3 pr-10 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <Eye className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
          </div>

          {mode === 'signup' && (
            <ul
              className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1"
              aria-live="polite"
              aria-atomic="true"
              role="status"
            >
              {passwordChecks.map(({ label, met }) => (
                <li
                  key={label}
                  className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${
                    met ? 'text-zinc-800 font-medium' : 'text-zinc-400'
                  }`}
                >
                  {met ? (
                    <Check className="w-3 h-3 flex-shrink-0" strokeWidth={2.5} stroke="currentColor" />
                  ) : (
                    <span className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-zinc-300" aria-hidden />
                  )}
                  {label}
                </li>
              ))}
            </ul>
          )}

          {mode === 'signup' && (
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 확인"
                required
                autoComplete="new-password"
                className={`w-full px-4 py-3 pr-10 bg-white border rounded-xl text-zinc-900 placeholder-stone-400 outline-none transition-colors duration-200 ${
                  confirmPassword && !passwordsMatch
                    ? 'border-zinc-400 focus:border-zinc-500'
                    : 'border-zinc-200 focus:border-zinc-400'
                }`}
              />
              <button
                type="button"
                onClick={toggleShowPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          )}

          {confirmPassword && !passwordsMatch && (
            <p className="text-zinc-600 text-sm font-light">비밀번호가 일치하지 않습니다</p>
          )}

          {error && (
            <p className="text-zinc-600 text-sm font-light">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'signup' && !canSignUp)}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>

          {mode === 'login' && !showResetFlow && (
            <button
              type="button"
              onClick={() => setShowResetFlow(true)}
              className="w-full py-1.5 text-zinc-500 text-xs font-light hover:text-zinc-700 transition-colors"
            >
              비밀번호를 잊으셨나요?
            </button>
          )}
        </form>
        )}

        {/* OR Divider & Social Login — 숨김 when reset flow */}
        {!showResetFlow && (
        <>
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-zinc-200" />
          <span className="text-stone-400 text-xs font-light tracking-widest uppercase">또는</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

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
        </>
        )}

        {!showResetFlow && (
        <button
          type="button"
          onClick={toggleMode}
          className="w-full mt-6 py-2 text-stone-500 text-sm font-light hover:text-zinc-700 transition-colors duration-200"
        >
          {mode === 'login' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
        </button>
        )}
      </div>
    </div>
  );
};
