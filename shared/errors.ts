// Typed error codes shared by the app and (from Phase 2) Edge Functions. SPEC §15.
// Each code maps to user-facing copy under `errors.<CODE>` in src/i18n/en.json.

export const APP_ERROR_CODES = [
  // Auth
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_CONFIRMED',
  'USER_EXISTS',
  'WEAK_PASSWORD',
  'SAME_PASSWORD',
  'AUTH_LINK_INVALID',
  'SIGN_IN_CANCELLED',
  'PROVIDER_UNAVAILABLE',
  // General (SPEC §15)
  'NETWORK_OFFLINE',
  'RATE_LIMITED',
  'FORBIDDEN',
  'INVALID_STATE',
  'UNKNOWN',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = 'AppError';
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && (APP_ERROR_CODES as readonly string[]).includes(value);
}
