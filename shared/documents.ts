import { z } from 'zod';

import { MAX_TITLE_LENGTH } from './limits';

// Messages are i18n keys (src/i18n/en.json → upload.*).
export const documentTitleSchema = z
  .string()
  .trim()
  .min(1, 'upload.titleRequired')
  .max(MAX_TITLE_LENGTH, 'upload.titleTooLong');

export const documentTitleFormSchema = z.object({ title: documentTitleSchema });
export type DocumentTitleValues = z.output<typeof documentTitleFormSchema>;
