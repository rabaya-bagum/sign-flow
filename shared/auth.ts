import { z } from 'zod';

// Validation messages are i18n keys; the UI translates them (see src/i18n/en.json → validation.*).
// Rules mirror supabase/config.toml: minimum_password_length = 10, password_requirements = letters_digits.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt input limit

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'validation.required')
  .pipe(z.email('validation.emailInvalid'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'validation.passwordTooShort')
  .max(PASSWORD_MAX_LENGTH, 'validation.passwordTooLong')
  .regex(/[A-Za-z]/, 'validation.passwordNeedsLetter')
  .regex(/[0-9]/, 'validation.passwordNeedsDigit');

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(120, 'validation.nameTooLong');

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.boolean().refine((v) => v, 'validation.acceptTerms'),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'validation.required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'validation.required'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'validation.passwordsDontMatch',
    path: ['confirmPassword'],
  });

export const phoneSchema = z
  .string()
  .trim()
  .max(32, 'validation.phoneInvalid')
  .regex(/^$|^\+?[0-9 ()-]{6,32}$/, 'validation.phoneInvalid');

export const profileSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
});

export type SignUpInput = z.input<typeof signUpSchema>;
export type SignUpValues = z.output<typeof signUpSchema>;
export type SignInValues = z.output<typeof signInSchema>;
export type ForgotPasswordValues = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.output<typeof resetPasswordSchema>;
export type ProfileValues = z.output<typeof profileSchema>;
