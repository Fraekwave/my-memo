import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';

interface EditableTitleProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Tesla-style inline editable title
 * - Click → borderless input, subtle underline when editing
 * - onBlur / Enter → save; empty → reset to default via onSave
 */
export const EditableTitle = ({
  value,
  onSave,
  placeholder = "Today's Tasks",
  className = '',
  inputClassName = '',
}: EditableTitleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    setIsEditing(false);
    onSave(editValue);
  }, [editValue, onSave]);

  const handleBlur = () => commit();

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
      inputRef.current?.blur();
    }
  };

  if (!isEditing) {
    return (
      <h1
        role="button"
        tabIndex={0}
        onClick={() => setIsEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsEditing(true);
          }
        }}
        className={`cursor-text outline-none focus:outline-none focus-visible:ring-0 ${className}`}
        style={{
          borderBottom: '1px solid transparent',
          transition: 'border-color 0.15s ease, color 0.15s ease',
        }}
        data-editable-title
        aria-label="앱 제목 (클릭하여 수정)"
      >
        <span
          className="border-b border-transparent hover:border-zinc-300/70 transition-colors duration-150"
          style={{ paddingBottom: '1px' }}
        >
          {value || placeholder}
        </span>
      </h1>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={`
        w-full max-w-full text-4xl sm:text-5xl font-light tracking-tight
        bg-transparent border-none outline-none
        text-zinc-900 placeholder:text-zinc-400
        border-b border-zinc-300 focus:border-zinc-500
        transition-colors duration-150
        ${inputClassName} ${className}
      `}
      aria-label="앱 제목 입력"
    />
  );
};
