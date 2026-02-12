import {
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type CompositionEvent,
} from 'react';

interface ContentEditableInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

// Base classes — placeholder via index.css [contenteditable]:empty:before
const BASE_CLASSES = 'content-editable-input min-h-[1.5em] outline-none';

/**
 * ContentEditable-based input — completely removes iOS Autofill Bar.
 * Korean IME (Hangul) safe: isComposing ref + textContent sync on compositionEnd.
 *
 * Use instead of <input> when the iOS Key/Card/Map bar must be eliminated.
 */
export const ContentEditableInput = ({
  value,
  onChange,
  onSubmit,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  placeholder,
  className = '',
  autoFocus = false,
}: ContentEditableInputProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  // Sync value from parent to DOM when prop changes (e.g., reset after submit)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isComposingRef.current) return;
    const current = el.textContent ?? '';
    if (value !== current) {
      el.textContent = value;
    }
  }, [value]);

  // Auto focus + select all (for TaskItem edit mode)
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [autoFocus]);

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const text = ref.current?.textContent ?? '';
    onChange(text);
  }, [onChange]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    onCompositionStart?.();
  }, [onCompositionStart]);

  const handleCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLDivElement>) => {
      isComposingRef.current = false;
      const text = (e.target as HTMLDivElement).textContent ?? '';
      onChange(text);
      onCompositionEnd?.();
    },
    [onChange, onCompositionEnd]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit?.();
        return;
      }
      onKeyDown?.(e);
    },
    [onSubmit, onKeyDown]
  );

  const mergedClassName = `${BASE_CLASSES} ${className}`.trim();

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={handleInput}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      className={mergedClassName}
      role="textbox"
      aria-placeholder={placeholder}
    />
  );
};
