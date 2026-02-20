import { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { KAKAO_AUTO_TRIGGER_MS } from '../hooks/useInAppBrowserEscape';

interface InAppBrowserGuardProps {
  /** Fires googlechromes:// (iOS) or Chrome Intent (Android). */
  onOpenChrome: () => void;
  /** Fires kakaotalk://web/openExternalApp (Kakao) or window.open (others). */
  onOpenSafari: () => void;
  /** True when UA is KakaoTalk — enables countdown + auto-trigger copy. */
  isKakao: boolean;
  onDismiss: () => void;
}

const TICK_MS = 100;

/**
 * Full-screen barrier shown when automatic Chrome-intent escape is not
 * possible (iOS only). Presents Chrome-first navigation with Safari fallback.
 *
 * For KakaoTalk users:
 *  - A live countdown shows remaining time before the KakaoTalk→Safari bridge
 *    is auto-triggered by the hook.
 *  - Either button can be pressed before the countdown expires.
 *
 * For other iOS in-app browsers (Instagram, Line, etc.):
 *  - Both buttons are available with no countdown.
 */
export const InAppBrowserGuard = ({
  onOpenChrome,
  onOpenSafari,
  isKakao,
  onDismiss,
}: InAppBrowserGuardProps) => {
  const url = window.location.href;

  // ── Countdown state (KakaoTalk only) ──────────────────────────────────────
  const [remainingMs, setRemainingMs] = useState(isKakao ? KAKAO_AUTO_TRIGGER_MS : 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isKakao) return;

    intervalRef.current = setInterval(() => {
      setRemainingMs(prev => {
        const next = prev - TICK_MS;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isKakao]);

  const countdownSecs = (remainingMs / 1000).toFixed(1);
  const progressPct   = isKakao ? (remainingMs / KAKAO_AUTO_TRIGGER_MS) * 100 : 0;

  // ── Button action tracking (reveals copy fallback) ────────────────────────
  const [actionAttempted, setActionAttempted] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleChrome = useCallback(() => {
    setActionAttempted(true);
    // Stop the Kakao auto-trigger countdown — user chose Chrome manually.
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemainingMs(0);
    onOpenChrome();
  }, [onOpenChrome]);

  const handleSafari = useCallback(() => {
    setActionAttempted(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRemainingMs(0);
    onOpenSafari();
  }, [onOpenSafari]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard API blocked (older iOS WebViews) — prompt as last resort.
      window.prompt('주소를 복사하세요:', url);
    }
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="외부 브라우저에서 열기"
    >
      {/* ── Lock icon ── */}
      <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mb-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-8 h-8 text-zinc-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>

      {/* ── Headline ── */}
      <h1 className="text-xl font-semibold text-zinc-900 text-center px-8 leading-snug">
        안전한 브라우저에서 열어주세요
      </h1>
      <p className="mt-2 text-sm text-zinc-500 text-center px-10 leading-relaxed">
        인앱 브라우저에서는 Google 로그인이 차단될 수 있어요.
        <br />
        Chrome 또는 Safari에서 접속하면 바로 로그인할 수 있어요.
      </p>

      {/* ── Kakao countdown bar ── */}
      {isKakao && remainingMs > 0 && (
        <div className="mt-5 w-full max-w-xs px-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-zinc-400">
              {countdownSecs}초 후 Safari에서 자동으로 열립니다
            </span>
          </div>
          <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-none"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Primary CTA: Chrome ── */}
      <div className="mt-6 w-full max-w-xs px-6 space-y-3">
        <button
          type="button"
          onClick={handleChrome}
          className="
            w-full flex items-center justify-center gap-3
            py-4 bg-zinc-900 text-white rounded-2xl
            text-base font-semibold
            transition-all duration-150 active:scale-[0.97] hover:bg-zinc-700
          "
        >
          {/* Chrome icon */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 opacity-90">
            <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm0 4.5a7.5 7.5 0 010 15 7.5 7.5 0 010-15zM12 2c1.654 0 3.214.424 4.574 1.17L12 9.5 7.426 3.17A9.956 9.956 0 0112 2zm-7.574 2.17L9 9.5H2.084A9.963 9.963 0 014.426 4.17zM2.084 14.5H9l-4.574 5.33A9.963 9.963 0 012.084 14.5zm2.342 6.33L9 15.5h6l4.574 5.33A9.963 9.963 0 0112 22a9.963 9.963 0 01-7.574-1.17zm12.148 1.17L12 15.5l4.574-5.33h6.842a9.963 9.963 0 01-6.842 11.5zm7.342-7.5H15l4.574-5.33A9.963 9.963 0 0121.916 14.5z" />
          </svg>
          Chrome으로 열기
        </button>

        {/* ── Secondary CTA: Safari ── */}
        <button
          type="button"
          onClick={handleSafari}
          className="
            w-full flex items-center justify-center gap-3
            py-3.5 bg-white text-zinc-800 rounded-2xl
            text-base font-medium border border-zinc-200
            transition-all duration-150 active:scale-[0.97] hover:border-zinc-400
          "
        >
          {/* Safari / globe icon */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5 text-blue-500">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
          </svg>
          Safari에서 열기
          {isKakao && remainingMs > 0 && (
            <span className="ml-1 text-xs text-zinc-400 font-normal">({countdownSecs}s)</span>
          )}
        </button>
      </div>

      {/* ── Copy fallback — appears after a button was tried ── */}
      {actionAttempted && (
        <div className="mt-6 w-full max-w-xs px-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-zinc-100" />
            <span className="text-xs text-zinc-400 whitespace-nowrap">열리지 않았나요?</span>
            <div className="flex-1 h-px bg-zinc-100" />
          </div>
          <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl mb-2">
            <p className="text-xs text-zinc-400 truncate font-mono">{url}</p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className={`
              w-full flex items-center justify-center gap-2.5 py-3 rounded-xl
              text-sm font-medium border transition-all duration-150 active:scale-[0.97]
              ${copied
                ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                : 'bg-white text-zinc-800 border-zinc-300 hover:border-zinc-400'
              }
            `}
          >
            {copied
              ? <Check className="w-4 h-4 text-zinc-500" strokeWidth={2.5} />
              : <Copy className="w-4 h-4" strokeWidth={1.75} />
            }
            {copied ? '복사 완료! 브라우저 주소창에 붙여넣으세요' : '주소 복사하기'}
          </button>
        </div>
      )}

      {/* ── Dismiss ── */}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-8 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
      >
        이미 외부 브라우저를 사용 중이에요
      </button>
    </div>
  );
};
