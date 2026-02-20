import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Loop-prevention ──────────────────────────────────────────────────────────
// Written to sessionStorage before the first redirect attempt.
// If the scheme is unrecognised and the WebView reloads the page, the flag is
// already set and the second pass exits immediately — no infinite loop.

const ESCAPE_ATTEMPTED_KEY = 'iae_escape_attempted';
function markEscapeAttempted(): void {
  try { sessionStorage.setItem(ESCAPE_ATTEMPTED_KEY, '1'); } catch { /* private mode */ }
}
function hasEscapeBeenAttempted(): boolean {
  try { return sessionStorage.getItem(ESCAPE_ATTEMPTED_KEY) === '1'; } catch { return false; }
}

// ─── UA detection ─────────────────────────────────────────────────────────────

/** Targeted in-app browser patterns (as specified). */
const IN_APP_UA_PATTERNS = ['KAKAOTALK', 'Instagram', 'FBAN', 'FBAV', 'Line/'] as const;

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
    isKakao: ua.includes('KAKAOTALK'),
  };
}

// ─── URL scheme builders ──────────────────────────────────────────────────────

/**
 * Android Intent URL — hard-targets Chrome (com.android.chrome).
 * No browser_fallback_url: if Chrome is not installed the OS returns to the
 * in-app browser, which is acceptable since we want Chrome or nothing.
 *
 * Format: intent://HOST/PATH?QUERY#Intent;scheme=https;package=com.android.chrome;end
 */
function buildChromeIntentUrl(url: string): string {
  try {
    const { host, pathname, search, hash } = new URL(url);
    return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch { return url; }
}

/**
 * iOS Chrome URL scheme.
 * googlechromes:// → opens in Chrome for HTTPS URLs.
 * Strips the protocol prefix; Chrome re-attaches it from the scheme name.
 *
 * Example: https://example.com/app?q=1 → googlechromes://example.com/app?q=1
 */
function buildChromeIOSUrl(url: string): string {
  try {
    const { protocol, host, pathname, search, hash } = new URL(url);
    const scheme = protocol === 'https:' ? 'googlechromes' : 'googlechrome';
    return `${scheme}://${host}${pathname}${search}${hash}`;
  } catch { return url; }
}

/**
 * KakaoTalk bridge URL — tells KakaoTalk to open the given URL in the
 * device's default external browser (Safari on iOS, Chrome on Android).
 *
 * "openExternalApp" launches an independent browser process; "openExternal"
 * only navigates KakaoTalk's own address-bar WebView.
 */
function buildKakaoExternalUrl(url: string): string {
  return `kakaotalk://web/openExternalApp?url=${encodeURIComponent(url)}`;
}

// ─── Scheme firing ────────────────────────────────────────────────────────────

/**
 * Navigate to a URL scheme and stop the in-app browser immediately.
 * window.stop() is called synchronously AND at +50 ms (belt-and-suspenders
 * for WebViews that ignore the synchronous call).
 */
function fireSchemeAndStop(schemeUrl: string): void {
  window.location.href = schemeUrl;
  try { window.stop(); } catch { /* ignore */ }
  setTimeout(() => { try { window.stop(); } catch { /* ignore */ } }, 50);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Duration (ms) before KakaoTalk iOS auto-triggers the Safari bridge. */
export const KAKAO_AUTO_TRIGGER_MS = 1500;

export interface InAppBrowserEscapeState {
  /** True when the UA matches a known in-app browser. */
  isInApp: boolean;
  /** True when the iOS guide should be shown. */
  showGuide: boolean;
  dismissGuide: () => void;
  /** True only for KakaoTalk iOS — drives the countdown UI. */
  isKakao: boolean;
  /**
   * Fires googlechromes:// (iOS) or Chrome intent:// (Android).
   * Safe to call from a button click handler (user-gesture context).
   */
  openInChrome: () => void;
  /**
   * Fires kakaotalk://web/openExternalApp (KakaoTalk) or window.open (others).
   * Safe to call from a button click handler.
   */
  openInSafari: () => void;
}

/**
 * Detects in-app browsers and escapes to a standalone browser.
 *
 * Platform strategies:
 *  Android (any IAB)  → Chrome Intent (hard-targets com.android.chrome)
 *  iOS KakaoTalk      → show guide immediately + auto-fire Safari bridge at 1.5 s
 *  iOS other IAB      → show guide immediately (no auto-trigger)
 *
 * Both guide buttons (Chrome, Safari) are available for manual fallback on iOS.
 *
 * @param enabled Pass false to skip the hook (e.g. user already authenticated).
 */
export function useInAppBrowserEscape(enabled = true): InAppBrowserEscapeState {
  const uaRef = useRef<UAInfo | null>(null);
  if (uaRef.current === null) uaRef.current = detectUA();
  const { isInApp, isAndroid, isIOS, isKakao } = uaRef.current;

  const [showGuide, setShowGuide] = useState(false);

  // ── openInChrome ──────────────────────────────────────────────────────────
  const openInChrome = useCallback(() => {
    const url = window.location.href;
    if (isAndroid) {
      window.location.replace(buildChromeIntentUrl(url));
      try { window.stop(); } catch { /* ignore */ }
    } else {
      // iOS: googlechromes:// scheme — user-gesture context helps acceptance.
      fireSchemeAndStop(buildChromeIOSUrl(url));
    }
  }, [isAndroid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── openInSafari ──────────────────────────────────────────────────────────
  const openInSafari = useCallback(() => {
    const url = window.location.href;
    if (isKakao) {
      // KakaoTalk bridge: hands the URL off to the system default browser.
      fireSchemeAndStop(buildKakaoExternalUrl(url));
    } else {
      // Other iOS in-app browsers: attempt window.open in user-gesture context.
      // Many in-app browsers allow this to escape to the system browser.
      try {
        const w = window.open(url, '_blank', 'noopener');
        if (!w) throw new Error('blocked');
      } catch {
        // Absolute last resort: copy to clipboard (guard component handles UI).
      }
    }
  }, [isKakao]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-redirect on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !isInApp) return;
    if (hasEscapeBeenAttempted()) return; // loop guard — bail on second pass

    markEscapeAttempted();        // stamp BEFORE any navigation attempt
    const url = window.location.href;

    // ── Android: hard-redirect to Chrome immediately ──────────────────────
    if (isAndroid) {
      window.location.replace(buildChromeIntentUrl(url));
      try { window.stop(); } catch { /* ignore */ }
      return;
    }

    // ── iOS: show two-button guide immediately ────────────────────────────
    if (isIOS) {
      setShowGuide(true);

      if (isKakao) {
        // Auto-trigger the KakaoTalk Safari bridge after 1.5 s.
        // Gives the user time to choose Chrome manually; if they don't act,
        // Safari is the safe fallback.
        const timer = setTimeout(() => {
          fireSchemeAndStop(buildKakaoExternalUrl(url));
        }, KAKAO_AUTO_TRIGGER_MS);
        return () => clearTimeout(timer);
      }
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // UA fields come from a stable ref — safe to omit from deps.

  return {
    isInApp,
    showGuide,
    dismissGuide: () => setShowGuide(false),
    isKakao,
    openInChrome,
    openInSafari,
  };
}
