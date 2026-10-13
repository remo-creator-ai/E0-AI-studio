import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './ko.json';
import en from './en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en'],
    // E0 starts in Korean. Only an explicit E0 language choice overrides it.
    lng: localStorage.getItem('e0-language') === 'en' ? 'en' : 'ko',
    interpolation: {
      escapeValue: false,
    },
  });

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', language => { document.documentElement.lang = language; });

export default i18n;
