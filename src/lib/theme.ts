/**
 * Theme management — Light / Dark / System.
 *
 * Persists the user's choice in localStorage and applies it to the
 * <html> element via `data-theme="light" | "dark"`. CSS rules in
 * src/index.css key off this attribute.
 *
 * Defaults to 'light' so first-time visitors (especially on Samsung
 * devices with Force Dark) get the safest possible state.
 */

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mamavault.theme.v1';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage may throw in privacy modes
  }
  return 'light';
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore quota / disabled storage
  }
}

/**
 * Resolve the effective dark/light mode given a Theme. 'system' consults
 * the OS preference via matchMedia.
 */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply the theme to <html> + <meta name="theme-color"> so the address
 * bar matches. Safe to call repeatedly. Dispatches a 'themechange' event
 * on window so JS-driven styles (e.g. visualAging task colors) can recompute.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', resolved);

  // Update theme-color meta so Chrome's address bar matches.
  const themeColor = resolved === 'dark' ? '#1c1917' : '#fafaf5';
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = themeColor;

  // Notify JS-driven styles. CSS-driven styles (Tailwind, [data-theme] rules)
  // update automatically; this event is for code that reads the theme at runtime.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('themechange', { detail: { resolved } }));
  }
}

/**
 * Subscribe to OS-level theme changes when the user is on 'system' mode.
 * Returns an unsubscribe function. No-op for 'light' / 'dark' modes.
 */
export function watchSystemTheme(currentTheme: Theme, onChange: () => void): () => void {
  if (typeof window === 'undefined' || currentTheme !== 'system') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => onChange();
  mq.addEventListener?.('change', listener);
  return () => mq.removeEventListener?.('change', listener);
}
