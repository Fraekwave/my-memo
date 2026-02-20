import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
] as const;

/**
 * Compact language toggle. Renders the two language pills side by side.
 * Active language is highlighted; switching is instant (no page reload).
 */
export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('ko') ? 'ko' : 'en';

  return (
    <div
      className="flex items-center gap-0.5 bg-zinc-100 rounded-lg p-0.5"
      role="radiogroup"
      aria-label="Language"
    >
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={current === code}
          onClick={() => i18n.changeLanguage(code)}
          className={`
            px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150
            ${current === code
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
