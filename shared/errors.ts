// Typed error codes shared by the app and Edge Functions (SPEC §15). No imports: loaded by Metro and Deno.
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
  // Files (SPEC §15)
  'FILE_UNSUPPORTED',
  'FILE_TOO_LARGE',
  'UPLOAD_FAILED',
  'PDF_RENDER_FAILED',
  // Signatures (SPEC §5.7)
  'SIGNATURE_LIMIT',
  'SIGNATURE_TOO_SIMPLE',
  // Signing links and signing (SPEC §7, §15)
  'LINK_INVALID',
  'LINK_EXPIRED',
  'NOT_YOUR_TURN',
  'OTP_REQUIRED',
  'OTP_INVALID',
  // General (SPEC §15)
  'NETWORK_OFFLINE',
  'RATE_LIMITED',
  'FORBIDDEN',
  'INVALID_STATE',
  'INVALID_INPUT',
  'NOT_FOUND',
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
