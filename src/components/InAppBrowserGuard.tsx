import { useState, useCallback } from 'react';
import { Copy, Check, Globe } from 'lucide-react';

interface InAppBrowserGuardProps {
  onDismiss: () => void;
}

/**
 * Full-screen overlay shown on iOS in-app browsers (Instagram, Facebook, etc.)
 * where automatic redirection to Safari is not possible.
 *
 * Guides the user to copy the current URL and open it in Safari manually,
 * which is required for Google OAuth to work.
 */
export const InAppBrowserGuard = ({ onDismiss }: InAppBrowserGuardProps) => {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API not available (older iOS WebViews) — fall back to prompt
      window.prompt('주소를 길게 눌러 복사하세요:', url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Safari에서 열기 안내"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-card">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="w-11 h-11 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-blue-600" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 leading-snug">
              Safari에서 열어주세요
            </h2>
            <p className="text-sm text-zinc-500 font-light mt-0.5 leading-snug">
              Google 로그인은 인앱 브라우저를 지원하지 않아요.
              Safari에서 접속하면 정상적으로 로그인할 수 있어요.
            </p>
          </div>
        </div>

        {/* Steps */}
        <ol className="px-6 pb-5 space-y-3">
          {[
            '아래 버튼을 눌러 주소를 복사하세요.',
            'Safari 앱을 열고 주소창에 붙여넣으세요.',
            'Google 로그인을 진행하세요.',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-zinc-700 leading-snug">{step}</span>
            </li>
          ))}
        </ol>

        {/* URL preview */}
        <div className="mx-6 mb-4 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg">
          <p className="text-xs text-zinc-400 truncate font-mono">{url}</p>
        </div>

        {/* Copy button */}
        <div className="px-6 pb-3">
          <button
            type="button"
            onClick={copyUrl}
            className={`
              w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl
              text-sm font-medium transition-all duration-200 active:scale-[0.98]
              ${copied
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-900 text-white hover:bg-zinc-700'
              }
            `}
          >
            {copied
              ? <Check className="w-4 h-4" strokeWidth={2.5} />
              : <Copy className="w-4 h-4" strokeWidth={1.75} />
            }
            {copied ? '복사되었습니다!' : '주소 복사하기'}
          </button>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          className="w-full pb-5 pt-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          이미 Safari를 사용 중이에요
        </button>
      </div>
    </div>
  );
};
