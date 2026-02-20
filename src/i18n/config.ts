import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import ko from '../locales/ko.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
    },
    // Always follow the live environment — no stale manual overrides.
    // Priority: browser Accept-Language → <html lang> → URL path → subdomain
    detection: {
      order: ['navigator', 'htmlTag', 'path', 'subdomain'],
      caches: [], // do not persist to localStorage or cookies
    },
    fallbackLng: 'ko',
    supportedLngs: ['en', 'ko'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;
