import { useState, FormEvent, useCallback, useMemo } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

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

interface PasswordResetConfirmProps {
  onSuccess: () => void;
}

/**
 * PASSWORD_RECOVERY 모드: 이메일 링크 클릭 후 새 비밀번호 입력
 * - updateUser({ password }) 호출로 재설정 완료
 */
export const PasswordResetConfirm = ({ onSuccess }: PasswordResetConfirmProps) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = useMemo(
    () => confirmPassword === '' || password === confirmPassword,
    [password, confirmPassword]
  );

  const passwordChecks = useMemo(
    () =>
      PASSWORD_CRITERIA_TESTS.map((test, i) => ({
        label: t(CRITERIA_KEYS[i]),
        met: test(password),
      })),
    [password, t]
  );
  const allPasswordCriteriaMet = useMemo(
    () => passwordChecks.every((c) => c.met),
    [passwordChecks]
  );

  const canSubmit = useMemo(
    () =>
      allPasswordCriteriaMet &&
      confirmPassword.length > 0 &&
      password === confirmPassword,
    [allPasswordCriteriaMet, password, confirmPassword]
  );

  const toggleShowPassword = useCallback(() => setShowPassword((p) => !p), []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setError(null);
      setLoading(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('auth.recoveryError'));
      } finally {
        setLoading(false);
      }
    },
    [password, canSubmit, onSuccess, t]
  );

  return (
    <div className="h-full flex items-center justify-center p-6 sm:p-8 bg-stone-50">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-light text-zinc-900 tracking-tight text-center mb-1">
          INA Done
        </h1>
        <p className="text-stone-500 text-sm font-light text-center mb-8 tracking-wide">
          {t('auth.subtitle_recovery')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password')}
              required
              autoComplete="new-password"
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

          <ul
            className="flex flex-wrap gap-x-4 gap-y-1"
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

          {confirmPassword && !passwordsMatch && (
            <p className="text-zinc-600 text-sm font-light">{t('auth.passwordMismatch')}</p>
          )}

          {error && <p className="text-zinc-600 text-sm font-light">{error}</p>}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('auth.processing') : t('auth.setNewPassword')}
          </button>
        </form>
      </div>
    </div>
  );
};
