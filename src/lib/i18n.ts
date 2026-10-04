import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/i18n/en.json';

export const defaultNS = 'translation';
export const resources = { en: { translation: en } } as const;

// English only at launch (SPEC §2). Resources are bundled, so init is synchronous.
const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
