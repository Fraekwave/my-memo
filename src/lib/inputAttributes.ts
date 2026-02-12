/**
 * Shared input attributes for memo/task text fields
 *
 * Strict Attribute Strategy — iOS Autofill Bar suppression without CSS hacks.
 * Zero risk to Korean IME (Hangul) composition.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-autocapitalize
 */
export const memoInputProps = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  name: 'memo_body_text_input',
} as const;
