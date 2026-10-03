import { useTranslation } from 'react-i18next';

import { AppError } from '@shared/errors';

import { toAppError } from '@/lib/errors';

/** Maps any thrown error to translated, user-facing copy (SPEC §15). */
export function useAppErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown): string => {
    const appError = error instanceof AppError ? error : toAppError(error);
    return t(`errors.${appError.code}`);
  };
}
