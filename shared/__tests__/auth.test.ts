import {
  emailSchema,
  passwordSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '../auth';

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('emailSchema', () => {
  it('trims and lowercases valid emails', () => {
    expect(emailSchema.parse('  John@Example.COM ')).toBe('john@example.com');
  });

  it('rejects empty and malformed emails with i18n keys', () => {
    expect(firstMessage(emailSchema.safeParse(''))).toBe('validation.required');
    expect(firstMessage(emailSchema.safeParse('not-an-email'))).toBe('validation.emailInvalid');
  });
});

describe('passwordSchema', () => {
  it('accepts passwords with ≥10 chars, a letter and a digit', () => {
    expect(passwordSchema.safeParse('abcdefghi1').success).toBe(true);
  });

  it.each([
    ['short1', 'validation.passwordTooShort'],
    ['abcdefghijkl', 'validation.passwordNeedsDigit'],
    ['123456789012', 'validation.passwordNeedsLetter'],
    ['a1'.repeat(37), 'validation.passwordTooLong'],
  ])('rejects %s', (value, message) => {
    expect(firstMessage(passwordSchema.safeParse(value))).toBe(message);
  });
});

describe('signUpSchema', () => {
  const valid = {
    fullName: '  Aaliyah Fatimah ',
    email: 'aaliyah@example.com',
    password: 'correcthorse1',
    acceptTerms: true,
  };

  it('accepts a valid sign-up and trims the name', () => {
    expect(signUpSchema.parse(valid).fullName).toBe('Aaliyah Fatimah');
  });

  it('requires accepting the terms', () => {
    expect(firstMessage(signUpSchema.safeParse({ ...valid, acceptTerms: false }))).toBe(
      'validation.acceptTerms',
    );
  });

  it('requires a name', () => {
    expect(firstMessage(signUpSchema.safeParse({ ...valid, fullName: '   ' }))).toBe('validation.required');
  });
});

describe('signInSchema', () => {
  it('does not apply password strength rules on sign-in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  it('requires matching passwords and reports on confirmPassword', () => {
    const result = resetPasswordSchema.safeParse({ password: 'abcdefghi1', confirmPassword: 'abcdefghi2' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
    expect(result.error?.issues[0]?.message).toBe('validation.passwordsDontMatch');
  });
});

describe('profileSchema', () => {
  it('allows an empty phone', () => {
    expect(profileSchema.safeParse({ fullName: 'John', phone: '' }).success).toBe(true);
  });

  it('rejects letters in phone numbers', () => {
    expect(firstMessage(profileSchema.safeParse({ fullName: 'John', phone: 'call me' }))).toBe(
      'validation.phoneInvalid',
    );
  });
});
