import { useTranslation } from 'react-i18next';

import en from '@/i18n/en.json';

type ValidationKey = keyof (typeof en)['validation'];

function isValidationKey(key: string): key is ValidationKey {
  return Object.prototype.hasOwnProperty.call(en.validation, key);
}

/** Translates a Zod issue message of the form "validation.<key>"; passes other strings through. */
export function useValidationMessage(message: string | undefined): string | undefined {
  const { t } = useTranslation();
  if (!message) return undefined;
  const key = message.startsWith('validation.') ? message.slice('validation.'.length) : '';
  return isValidationKey(key) ? t(`validation.${key}`) : message;
}
