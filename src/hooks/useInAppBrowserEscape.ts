import { useEffect, useRef, useState } from 'react';

// ─── Loop-prevention flag ─────────────────────────────────────────────────────
// Written to sessionStorage before any redirect attempt.
// If the in-app browser somehow re-renders the page after a failed scheme launch
// (e.g. the URL scheme was unrecognised and the page reloaded), the second pass
// reads this flag and bails out immediately instead of looping.
const ESCAPE_ATTEMPTED_KEY = 'iae_escape_attempted';

function markEscapeAttempted(): void {
  try { sessionStorage.setItem(ESCAPE_ATTEMPTED_KEY, '1'); } catch { /* private mode */ }
}

function hasEscapeBeenAttempted(): boolean {
  try { return sessionStorage.getItem(ESCAPE_ATTEMPTED_KEY) === '1'; } catch { return false; }
}

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Known in-app browser UA substrings.
 * Standard mobile browsers (Safari, Chrome, Firefox, Samsung Internet, Edge)
 * do NOT contain any of these — so a positive match is a reliable in-app signal.
 */
const IN_APP_UA_PATTERNS = [
  'KAKAOTALK',      // KakaoTalk (Android + iOS)
  'Instagram',      // Instagram
  'FBAN',           // Facebook App
  'FBAV',           // Facebook App (older versions)
  'FB_IAB',         // Facebook In-App Browser
  'FB4A',           // Facebook for Android
  'FBIOS',          // Facebook for iOS
  'Line/',          // LINE messenger
  'NAVER',          // Naver App
  'MicroMessenger', // WeChat
  'Snapchat',       // Snapchat
  'Twitter',        // Twitter / X
  'trill',          // TikTok
  'musical_ly',     // TikTok (legacy)
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
  // isInApp is true ONLY when a known in-app pattern is present.
  // Standard mobile browser UAs (Safari, Chrome) never match these strings.
  const isInApp = IN_APP_UA_PATTERNS.some(p => ua.includes(p));
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  // Explicit KakaoTalk check — used for its dedicated URL scheme path.
  const isKakao = ua.includes('KAKAOTALK');
  return { isInApp, isAndroid, isIOS, isKakao };
}

// ─── Redirect helpers ────────────────────────────────────────────────────────

/**
 * KakaoTalk URL scheme that instructs the in-app browser to open the given
 * URL in the device's default external browser (Safari on iOS, Chrome on Android).
 *
 * Scheme: kakaotalk://web/openExternalApp?url=<encoded>
 *
 * "openExternalApp" is the correct action name (not "openExternal") that
 * triggers a full external browser launch rather than just loading the URL
 * inside KakaoTalk's own address-bar view.
 */
function buildKakaoExternalUrl(url: string): string {
  return `kakaotalk://web/openExternalApp?url=${encodeURIComponent(url)}`;
}

/**
 * Android Intent URL that forces the current page to open in Chrome.
 * If Chrome is not installed Android falls back to the system default browser.
 *
 * Format: intent://HOST/PATH?QUERY#Intent;scheme=https;package=com.android.chrome;end
 */
function buildChromeIntentUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `intent://${parsed.host}${path}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return url;
  }
}

/**
 * Fire a URL scheme and immediately stop the in-app browser from continuing
 * to render the current page.
 *
 * Calling window.stop() cancels any pending resource loads in the WebView.
 * The short setTimeout ensures the assignment to window.location.href is
 * committed to the navigation stack before stop() is called, preventing
 * the scheme from being aborted.
 */
function fireSchemeAndStop(schemeUrl: string): void {
  window.location.href = schemeUrl;
  setTimeout(() => {
    try { window.stop(); } catch { /* older WebViews */ }
  }, 50);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface InAppBrowserEscapeState {
  /** True when running inside a detected in-app browser. */
  isInApp: boolean;
  /**
   * True when the app is on iOS inside an in-app browser that cannot be
   * auto-redirected. The caller should render <InAppBrowserGuard>.
   */
  showIOSGuide: boolean;
  dismissIOSGuide: () => void;
}

/**
 * Detects in-app browsers and escapes to the system browser.
 *
 * Escape paths:
 * - KakaoTalk (Android + iOS): `kakaotalk://web/openExternalApp?url=<encoded>`
 * - Other Android in-app browsers: Chrome intent:// scheme
 * - Other iOS in-app browsers: sets showIOSGuide (manual copy-paste guide)
 *
 * Loop prevention: a sessionStorage flag is written before any redirect so
 * that a failed scheme launch that reloads the page does not re-trigger.
 *
 * @param enabled Pass `false` to disable (e.g. user is already authenticated).
 */
export function useInAppBrowserEscape(enabled = true): InAppBrowserEscapeState {
  // UA detection runs exactly once per session (stable ref, no re-render cost).
  const uaRef = useRef<UAInfo | null>(null);
  if (uaRef.current === null) uaRef.current = detectUA();
  const { isInApp, isAndroid, isIOS, isKakao } = uaRef.current;

  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Guard 1: hook is disabled or not in an in-app browser.
    if (!enabled || !isInApp) return;

    // Guard 2: a redirect was already attempted this session — do not loop.
    if (hasEscapeBeenAttempted()) return;

    // Stamp the flag BEFORE firing the scheme so it is set even if the
    // assignment throws or the WebView reloads synchronously.
    markEscapeAttempted();

    const currentUrl = window.location.href;

    // ── KakaoTalk (both Android and iOS) ─────────────────────────────────
    // KakaoTalk has its own URL scheme on both platforms, so handle it
    // first before the generic Android/iOS branches.
    if (isKakao) {
      fireSchemeAndStop(buildKakaoExternalUrl(currentUrl));
      // Show the iOS guide as a safety net after 1.5 s in case the scheme
      // was silently rejected (iOS only; Android scheme usually succeeds).
      if (isIOS) {
        setTimeout(() => setShowIOSGuide(true), 1500);
      }
      return;
    }

    // ── Other Android in-app browsers ────────────────────────────────────
    if (isAndroid) {
      window.location.replace(buildChromeIntentUrl(currentUrl));
      try { window.stop(); } catch { /* ignore */ }
      return;
    }

    // ── Other iOS in-app browsers ─────────────────────────────────────────
    // No reliable URL scheme for generic iOS WebViews — show manual guide.
    if (isIOS) {
      setShowIOSGuide(true);
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // isInApp/isAndroid/isIOS/isKakao are from a stable ref — safe to omit.

  return {
    isInApp,
    showIOSGuide,
    dismissIOSGuide: () => setShowIOSGuide(false),
  };
}
