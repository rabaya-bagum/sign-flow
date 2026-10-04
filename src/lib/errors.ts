import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import { AppError, isAppError, type AppErrorCode } from '@shared/errors';

const AUTH_CODE_MAP: Record<string, AppErrorCode> = {
  invalid_credentials: 'INVALID_CREDENTIALS',
  email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
  user_already_exists: 'USER_EXISTS',
  email_exists: 'USER_EXISTS',
  weak_password: 'WEAK_PASSWORD',
  same_password: 'SAME_PASSWORD',
  over_email_send_rate_limit: 'RATE_LIMITED',
  over_request_rate_limit: 'RATE_LIMITED',
  over_sms_send_rate_limit: 'RATE_LIMITED',
  flow_state_not_found: 'AUTH_LINK_INVALID',
  flow_state_expired: 'AUTH_LINK_INVALID',
  otp_expired: 'AUTH_LINK_INVALID',
  bad_code_verifier: 'AUTH_LINK_INVALID',
  validation_failed: 'AUTH_LINK_INVALID',
  // Re-authentication and two-factor (SPEC §5.10).
  reauthentication_needed: 'REAUTH_REQUIRED',
  reauthentication_not_valid: 'OTP_INVALID',
  mfa_verification_failed: 'OTP_INVALID',
  mfa_challenge_expired: 'OTP_INVALID',
  insufficient_aal: 'MFA_REQUIRED',
};

function hasStringCode(value: unknown): value is { code: string; message?: string } {
  return (
    typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string'
  );
}

function looksLikeNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'TypeError' && /network|fetch/i.test(error.message);
}

/** Normalizes Supabase Auth / PostgREST / network errors into a typed AppError (SPEC §15). */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (isAuthRetryableFetchError(error) || looksLikeNetworkFailure(error)) {
    return new AppError('NETWORK_OFFLINE', undefined, { cause: error });
  }

  if (isAuthError(error)) {
    const mapped = error.code ? AUTH_CODE_MAP[error.code] : undefined;
    if (mapped) return new AppError(mapped, error.message, { cause: error });
    if (error.status === 429) return new AppError('RATE_LIMITED', error.message, { cause: error });
    return new AppError('UNKNOWN', error.message, { cause: error });
  }

  // PostgREST errors carry a Postgres SQLSTATE in `code`.
  if (hasStringCode(error)) {
    if (error.code === '42501' || error.code === 'PGRST301') {
      return new AppError('FORBIDDEN', error.message, { cause: error });
    }
    if (error.code === 'PGRST116') return new AppError('FORBIDDEN', error.message, { cause: error });
    // Raised by the saved_signatures insert trigger (5 per kind).
    if (error.code === 'SF001') return new AppError('SIGNATURE_LIMIT', error.message, { cause: error });
  }

  return new AppError('UNKNOWN', error instanceof Error ? error.message : undefined, { cause: error });
}
