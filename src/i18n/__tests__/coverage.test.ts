import { APP_ERROR_CODES } from '@shared/errors';

import { DISPLAY_STATUSES } from '@/theme';

import en from '../en.json';

describe('English copy coverage', () => {
  it.each(APP_ERROR_CODES)('has user-facing copy for error %s', (code) => {
    expect(en.errors[code]).toEqual(expect.any(String));
  });

  it.each(DISPLAY_STATUSES)('has a label for status %s', (status) => {
    expect(en.status[status]).toEqual(expect.any(String));
  });

  it('has a translation for every validation key used by shared schemas', () => {
    // Keep in sync with shared/auth.ts; a missing key would surface as a raw "validation.x" string.
    const used = [
      'required',
      'emailInvalid',
      'passwordTooShort',
      'passwordTooLong',
      'passwordNeedsLetter',
      'passwordNeedsDigit',
      'passwordsDontMatch',
      'nameTooLong',
      'acceptTerms',
      'phoneInvalid',
    ] as const;
    for (const key of used) expect(en.validation[key]).toEqual(expect.any(String));
  });
});
