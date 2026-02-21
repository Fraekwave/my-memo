import { useState, FormEvent, useCallback, useMemo, useEffect, useRef } from 'react';
import { Loader2, Check, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { GoogleGIcon } from '@/components/GoogleGIcon';

type AuthMode = 'login' | 'signup';

interface AuthProps {
  onSuccess: () => void;
}

const PASSWORD_CRITERIA_TESTS: ((p: string) => boolean)[] = [
  (p) => p.length >= 8,
  (p) => /[A-Z]/.test(p),
  (p) => /[a-z]/.test(p),
  (p) => /[0-9]/.test(p),
  (p) => /[@&$%#*()\-_+=.,!?;:'"\\/[\]{}^`~]/.test(p),
];
const CRITERIA_KEYS = [
  'auth.password_criteria.minLength',
  'auth.password_criteria.uppercase',
  'auth.password_criteria.lowercase',
  'auth.password_criteria.number',
  'auth.password_criteria.special',
] as const;

/**
 * Tesla-style Auth: Extreme minimalism, Zinc/Stone monochrome
 * - Professional typography, no brand colors
 * - Social login via Supabase OAuth
 */
export const Auth = ({ onSuccess }: AuthProps) => {
  const { t } = useTranslation();
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Window focus + pageshow: reset loading if user returns via Back button (bfcache) or closes OAuth tab
  useEffect(() => {
    if (!googleLoading) return;

    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const resetGoogleLoading = () => {
      if (googleTimeoutRef.current) {
        clearTimeout(googleTimeoutRef.current);
        googleTimeoutRef.current = null;
      }
      focusTimer = setTimeout(() => {
        setGoogleLoading(false);
        focusTimer = null;
      }, 500);
    };

    const handleFocus = () => resetGoogleLoading();
    // pageshow with persisted=true fires when browser restores page from bfcache (Back button)
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetGoogleLoading();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [googleLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (googleTimeoutRef.current) clearTimeout(googleTimeoutRef.current);
    };
  }, []);

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
        setError(err instanceof Error ? err.message : t('auth.authError'));
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
        setError(err instanceof Error ? err.message : t('auth.resetError'));
      } finally {
        setResetLoading(false);
      }
    },
    [email]
  );

  const passwordChecks = useMemo(
    () => PASSWORD_CRITERIA_TESTS.map((test, i) => ({
      label: t(CRITERIA_KEYS[i]),
      met: test(password),
    })),
    [password, t]
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

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setGoogleLoading(true);

    // 10s safeguard: if signInWithOAuth hangs (network error, blocked redirect, etc.)
    googleTimeoutRef.current = setTimeout(() => {
      setGoogleLoading(false);
      setError(t('auth.googleTimeout'));
      googleTimeoutRef.current = null;
    }, 10_000);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
        },
      });
      if (oauthError) throw oauthError;
      // Success: redirect begins; timeout/focus listener will cancel if user returns
    } catch (err) {
      if (googleTimeoutRef.current) {
        clearTimeout(googleTimeoutRef.current);
        googleTimeoutRef.current = null;
      }
      setError(err instanceof Error ? err.message : t('auth.googleError'));
      setGoogleLoading(false);
    }
  }, []);

  if (isSignedUp) {
    return (
      <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-stone-50">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-light text-zinc-900 tracking-tight mb-4">
            {t('auth.verifyEmailTitle')}
          </h1>
          <p className="text-zinc-600 text-sm font-light leading-relaxed mb-8">
            {t('auth.verifyEmailMessage')}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSignedUp(false);
              setMode('login');
            }}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99]"
          >
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-stone-50">
      <div className="w-full max-w-sm relative">
        <h1 className="text-3xl font-light text-zinc-900 tracking-tight text-center mb-1">
          INA Done
        </h1>
        <p className="text-stone-500 text-sm font-light text-center mb-8 tracking-wide">
          {showResetFlow
            ? t('auth.subtitle_reset')
            : mode === 'login'
              ? t('auth.subtitle_login')
              : t('auth.subtitle_signup')}
        </p>

        {showResetFlow ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailForReset')}
              required
              autoComplete="email"
              className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
            />
            {error && <p className="text-zinc-600 text-sm font-light">{error}</p>}
            {resetSuccess && (
              <p className="text-zinc-800 text-sm font-medium">
                {t('auth.resetSentMessage')}
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
                {t('common.back')}
              </button>
              <button
                type="submit"
                disabled={resetLoading || resetSuccess}
                className="flex-1 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetLoading ? t('auth.resetSending') : resetSuccess ? t('auth.resetSent') : t('auth.resetSend')}
              </button>
            </div>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.email')}
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password')}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full px-4 py-3 pr-10 bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-stone-400 outline-none focus:border-zinc-400 transition-colors duration-200"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
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
                placeholder={t('auth.confirmPassword')}
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
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
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
            <p className="text-zinc-600 text-sm font-light">{t('auth.passwordMismatch')}</p>
          )}

          {error && (
            <p className="text-zinc-600 text-sm font-light">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'signup' && !canSignUp)}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.signup')}
          </button>

          {mode === 'login' && !showResetFlow && (
            <button
              type="button"
              onClick={() => setShowResetFlow(true)}
              className="w-full py-1.5 text-zinc-500 text-xs font-light hover:text-zinc-700 transition-colors"
            >
              {t('auth.forgotPassword')}
            </button>
          )}
        </form>
        )}

        {/* OR Divider & Sign in with Google — 숨김 when reset flow */}
        {!showResetFlow && (
        <>
        <div className="flex items-center gap-4 my-6" role="separator" aria-label="구분선">
          <div className="flex-1 h-px bg-zinc-200" />
          <span className="text-zinc-400 text-xs font-light tracking-widest uppercase">OR</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className={`w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-zinc-200 rounded-xl text-zinc-800 hover:bg-zinc-50 transition-all duration-200 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white ${
            googleLoading ? 'opacity-75' : ''
          }`}
        >
          {googleLoading ? (
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" strokeWidth={1.5} />
          ) : (
            <GoogleGIcon className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">
            {googleLoading ? t('auth.googleConnecting') : t('auth.googleLogin')}
          </span>
        </button>
        </>
        )}

        {!showResetFlow && (
        <button
          type="button"
          onClick={toggleMode}
          className="w-full mt-6 py-2 text-stone-500 text-sm font-light hover:text-zinc-700 transition-colors duration-200"
        >
          {mode === 'login' ? t('auth.switchToSignup') : t('auth.switchToLogin')}
        </button>
        )}
      </div>
    </div>
  );
};
