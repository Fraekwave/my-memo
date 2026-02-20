import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Loop-prevention ─────────────────────────────────────────────────────────
// Written to sessionStorage BEFORE any redirect is attempted.
// If the in-app browser reloads the page after a failed scheme launch the second
// pass reads the flag and exits immediately — no infinite loop.

const ESCAPE_ATTEMPTED_KEY = 'iae_escape_attempted';

function markEscapeAttempted(): void {
  try { sessionStorage.setItem(ESCAPE_ATTEMPTED_KEY, '1'); } catch { /* private mode */ }
}
function hasEscapeBeenAttempted(): boolean {
  try { return sessionStorage.getItem(ESCAPE_ATTEMPTED_KEY) === '1'; } catch { return false; }
}

// ─── UA detection ─────────────────────────────────────────────────────────────

const IN_APP_UA_PATTERNS = [
  'KAKAOTALK',
  'Instagram',
  'FBAN', 'FBAV', 'FB_IAB', 'FB4A', 'FBIOS',
  'Line/',
  'NAVER',
  'MicroMessenger',
  'Snapchat',
  'Twitter',
  'trill', 'musical_ly',
] as const;

interface UAInfo {
  isInApp: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isKakao: boolean;
}

function detectUA(): UAInfo {
  if (typeof navigator === 'undefined') {
    return { isInApp: false, isAndroid: false, isIOS: false, isKakao: false };
  }
  const ua = navigator.userAgent;
  return {
    isInApp: IN_APP_UA_PATTERNS.some(p => ua.includes(p)),
    isAndroid: /Android/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    // Explicit flag — only true when UA literally contains "KAKAOTALK"
    isKakao: ua.includes('KAKAOTALK'),
  };
}

// ─── URL builders ─────────────────────────────────────────────────────────────

/**
 * KakaoTalk URL scheme: instructs KakaoTalk to hand off the URL to the
 * device's default external browser.
 *
 * "openExternalApp" (not "openExternal") is the correct action — it launches
 * an independent browser process rather than navigating inside KakaoTalk's
 * own WebView address-bar.
 */
export function buildKakaoExternalUrl(url: string): string {
  return `kakaotalk://web/openExternalApp?url=${encodeURIComponent(url)}`;
}

/**
 * Android Intent URL targeting Chrome with a browser_fallback_url so that
 * if Chrome is not installed, Android OS opens the URL in any available browser.
 *
 * Format:
 *   intent://HOST/PATH?QUERY
 *     #Intent;
 *       scheme=https;
 *       package=com.android.chrome;
 *       S.browser_fallback_url=ENCODED_HTTPS_URL;
 *     end
 */
function buildChromeIntentUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const fallback = encodeURIComponent(url);
    return (
      `intent://${parsed.host}${path}` +
      `#Intent;scheme=https;package=com.android.chrome;` +
      `S.browser_fallback_url=${fallback};end`
    );
  } catch {
    return url;
  }
}

// ─── Redirect execution ───────────────────────────────────────────────────────

/**
 * Fire a URL scheme and immediately stop the in-app browser from processing
 * further scripts or network requests.
 *
 * window.stop() is called synchronously for maximum immediacy — it cancels
 * pending sub-resource loads before the WebView can execute any return logic.
 * The 50 ms setTimeout is kept as an additional hard stop in case the
 * synchronous call is ignored by some WebView implementations.
 */
function fireSchemeAndStop(schemeUrl: string): void {
  window.location.href = schemeUrl;
  try { window.stop(); } catch { /* ignore on old WebViews */ }
  setTimeout(() => { try { window.stop(); } catch { /* ignore */ } }, 50);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface InAppBrowserEscapeState {
  isInApp: boolean;
  /**
   * True when iOS in-app browser auto-redirect failed or is not possible.
   * The caller should render <InAppBrowserGuard onOpenExternal={openExternal} />.
   */
  showIOSGuide: boolean;
  dismissIOSGuide: () => void;
  /**
   * Call from a button's onClick to re-attempt the external browser launch
   * within a user-gesture context (improves scheme acceptance on iOS).
   */
  openExternal: () => void;
}

/**
 * Detects in-app browsers and escapes to the system browser.
 *
 * Strategy:
 *  1. KakaoTalk (any platform) → `kakaotalk://web/openExternalApp?url=…`
 *  2. Other Android              → Chrome Intent with browser_fallback_url
 *  3. Other iOS                  → show <InAppBrowserGuard> immediately
 *
 * Loop prevention: sessionStorage flag is written before any redirect so
 * a failed scheme launch that reloads the page does not re-trigger the effect.
 *
 * @param enabled Pass `false` to skip (e.g. user is already authenticated).
 */
export function useInAppBrowserEscape(enabled = true): InAppBrowserEscapeState {
  const uaRef = useRef<UAInfo | null>(null);
  if (uaRef.current === null) uaRef.current = detectUA();
  const { isInApp, isAndroid, isIOS, isKakao } = uaRef.current;

  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // ── Auto-redirect on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !isInApp) return;
    if (hasEscapeBeenAttempted()) return; // loop guard

    markEscapeAttempted(); // stamp BEFORE firing — safe even if assignment throws

    const url = window.location.href;

    if (isKakao) {
      // KakaoTalk: specialized scheme works on both Android and iOS.
      fireSchemeAndStop(buildKakaoExternalUrl(url));
      // iOS fallback: if the scheme wasn't handled within 1 s, show the guide.
      if (isIOS) {
        setTimeout(() => setShowIOSGuide(true), 1000);
      }
      return;
    }

    if (isAndroid) {
      // Non-Kakao Android: Chrome Intent with OS-level browser fallback.
      window.location.replace(buildChromeIntentUrl(url));
      try { window.stop(); } catch { /* ignore */ }
      return;
    }

    if (isIOS) {
      // Other iOS in-app browsers: no reliable scheme, go straight to guide.
      setShowIOSGuide(true);
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual re-attempt (called from button click handler) ─────────────────
  // A user-gesture context can improve scheme acceptance rates on certain
  // iOS WebView versions that are more permissive with user-initiated navigations.
  const openExternal = useCallback(() => {
    const url = window.location.href;

    if (isKakao) {
      fireSchemeAndStop(buildKakaoExternalUrl(url));
      return;
    }

    if (isAndroid) {
      window.location.replace(buildChromeIntentUrl(url));
      try { window.stop(); } catch { /* ignore */ }
      return;
    }

    // iOS non-Kakao: try window.open in user-gesture context as a last resort.
    // Some in-app browsers allow this to escape to the system browser.
    try {
      const w = window.open(url, '_blank', 'noopener');
      // If the popup was blocked or didn't open, fall through to copy.
      if (!w) throw new Error('blocked');
    } catch {
      // Final fallback: clipboard copy (handled in <InAppBrowserGuard>).
    }
  }, [isKakao, isAndroid]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isInApp,
    showIOSGuide,
    dismissIOSGuide: () => setShowIOSGuide(false),
    openExternal,
  };
}
