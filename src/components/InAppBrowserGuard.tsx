import { useState, useCallback } from 'react';
import { Copy, Check, ExternalLink, Globe } from 'lucide-react';

interface InAppBrowserGuardProps {
  /**
   * Re-attempts the external browser launch within a user-gesture context.
   * Provided by useInAppBrowserEscape().openExternal.
   */
  onOpenExternal: () => void;
  onDismiss: () => void;
}

/**
 * Full-screen overlay shown when automatic escape to the system browser
 * has failed or is not possible (typically iOS non-Kakao in-app browsers).
 *
 * Two-tier strategy:
 *  1. Primary CTA  — re-fires the external-browser scheme in a user-gesture
 *                    context, which has a higher acceptance rate on iOS.
 *  2. Secondary CTA — copy URL to clipboard so the user can paste in Safari.
 */
export const InAppBrowserGuard = ({ onOpenExternal, onDismiss }: InAppBrowserGuardProps) => {
  const [copied, setCopied] = useState(false);
  const [openAttempted, setOpenAttempted] = useState(false);
  const url = window.location.href;

  const handleOpenExternal = useCallback(() => {
    setOpenAttempted(true);
    onOpenExternal();
    // After firing the scheme, if the user is still here after 1.2 s the
    // scheme was rejected — the UI already shows the copy fallback at that point.
  }, [onOpenExternal]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard API blocked (older iOS WebViews) — prompt as last resort
      window.prompt('주소를 복사하세요:', url);
    }
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="외부 브라우저 열기 안내"
    >
      {/* ── Icon ── */}
      <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mb-6">
        <Globe className="w-8 h-8 text-zinc-700" strokeWidth={1.5} />
      </div>

      {/* ── Headline ── */}
      <h1 className="text-xl font-semibold text-zinc-900 text-center px-8 leading-snug">
        외부 브라우저에서 열어주세요
      </h1>
      <p className="mt-2 text-sm text-zinc-500 font-light text-center px-10 leading-relaxed">
        인앱 브라우저에서는 Google 로그인이 차단될 수 있어요.
        Safari 또는 Chrome에서 접속하면 안전하게 로그인할 수 있어요.
      </p>

      {/* ── Primary CTA ── */}
      <div className="mt-8 w-full max-w-xs px-6">
        <button
          type="button"
          onClick={handleOpenExternal}
          className="
            w-full flex items-center justify-center gap-3
            py-4 bg-zinc-900 text-white rounded-2xl
            text-base font-semibold
            transition-all duration-150 active:scale-[0.97]
            hover:bg-zinc-700
          "
        >
          <ExternalLink className="w-5 h-5" strokeWidth={2} />
          Safari / Chrome으로 열기
        </button>
      </div>

      {/* ── Divider with fallback hint ── */}
      {openAttempted && (
        <div className="mt-6 w-full max-w-xs px-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-xs text-zinc-400">열리지 않았나요?</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          {/* URL preview */}
          <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl mb-3">
            <p className="text-xs text-zinc-400 truncate font-mono">{url}</p>
          </div>

          {/* Copy URL button */}
          <button
            type="button"
            onClick={handleCopy}
            className={`
              w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl
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
            {copied ? '복사 완료! Safari 주소창에 붙여넣으세요' : '주소 복사하기'}
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
