import { useTranslation } from 'react-i18next';

import en from '@/i18n/en.json';

type ValidationKey = keyof (typeof en)['validation'];
type UploadKey = keyof (typeof en)['upload'];

function has<T extends object>(obj: T, key: string): key is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Translates a Zod issue message that is an i18n key ("validation.<key>" or "upload.<key>");
 * passes other strings through.
 */
export function useValidationMessage(message: string | undefined): string | undefined {
  const { t } = useTranslation();
  if (!message) return undefined;
  const [ns, key = ''] = message.split('.', 2);
  if (ns === 'validation' && has(en.validation, key)) return t(`validation.${key as ValidationKey}`);
  if (ns === 'upload' && has(en.upload, key)) return t(`upload.${key as UploadKey}`);
  return message;
}
