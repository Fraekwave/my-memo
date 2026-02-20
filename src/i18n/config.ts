import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ko from '../locales/ko.json';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import zh from '../locales/zh.json';
import de from '../locales/de.json';
import es from '../locales/es.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
      zh: { translation: zh },
      de: { translation: de },
      es: { translation: es },
    },
    // Strip region suffixes so 'en-US', 'en-GB', 'zh-TW' etc. all match the
    // base language resource ('en', 'zh') instead of falling back to English.
    load: 'languageOnly',
    // Always read the live browser/OS language — no cache, no past selections.
    // Priority: navigator.language → <html lang>
    // Any language outside the 6 supported ones falls back to English.
    detection: {
      order: ['navigator', 'htmlTag'],
      caches: [],
    },
    fallbackLng: 'en',
    supportedLngs: ['ko', 'en', 'ja', 'zh', 'de', 'es'],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
