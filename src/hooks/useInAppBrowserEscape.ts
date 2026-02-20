import { useEffect, useRef, useState } from 'react';

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Known in-app browser UA substrings.
 * Google OAuth rejects requests from embedded WebViews, so we need
 * to detect these and redirect to the system browser.
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
  const isInApp = IN_APP_UA_PATTERNS.some(p => ua.includes(p));
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isKakao = ua.includes('KAKAOTALK');
  return { isInApp, isAndroid, isIOS, isKakao };
}

// ─── Redirect helpers ────────────────────────────────────────────────────────

/**
 * Build an Android Intent URL that forces the current page to open in Chrome.
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
 * KakaoTalk iOS exposes a URL scheme to open a URL in the external browser.
 * Falls back to undefined if the current URL cannot be parsed.
 */
function buildKakaoIOSExternalUrl(url: string): string | undefined {
  try {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  } catch {
    return undefined;
  }
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
 * - Android: immediately redirects to Chrome via the `intent://` scheme.
 * - iOS KakaoTalk: attempts the `kakaotalk://web/openExternal` URL scheme.
 * - iOS other: sets `showIOSGuide = true` so the caller can render a manual guide.
 *
 * @param enabled Pass `false` to disable the hook (e.g. user is already logged in).
 */
export function useInAppBrowserEscape(enabled = true): InAppBrowserEscapeState {
  // Run detection exactly once (stable ref, no re-render on UA read).
  const uaRef = useRef<UAInfo | null>(null);
  if (uaRef.current === null) uaRef.current = detectUA();
  const { isInApp, isAndroid, isIOS, isKakao } = uaRef.current;

  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (!enabled || !isInApp) return;

    const currentUrl = window.location.href;

    if (isAndroid) {
      // Redirect to Chrome via Android Intent scheme.
      // If Chrome is not installed, Android falls back to the default browser.
      window.location.replace(buildChromeIntentUrl(currentUrl));
      return;
    }

    if (isIOS) {
      if (isKakao) {
        // KakaoTalk iOS supports an openExternal URL scheme.
        const externalUrl = buildKakaoIOSExternalUrl(currentUrl);
        if (externalUrl) {
          window.location.href = externalUrl;
          // Show the guide as a fallback in case the scheme doesn't fire.
          setTimeout(() => setShowIOSGuide(true), 1500);
          return;
        }
      }
      // All other iOS in-app browsers: cannot auto-redirect, show manual guide.
      setShowIOSGuide(true);
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ isInApp/isAndroid/isIOS/isKakao are derived from a stable ref, safe to omit.

  return {
    isInApp,
    showIOSGuide,
    dismissIOSGuide: () => setShowIOSGuide(false),
  };
}
