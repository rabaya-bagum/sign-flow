import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { AppError } from '@shared/errors';

import { toAppError } from '../errors';

describe('toAppError', () => {
  it.each([
    ['invalid_credentials', 'INVALID_CREDENTIALS'],
    ['email_not_confirmed', 'EMAIL_NOT_CONFIRMED'],
    ['user_already_exists', 'USER_EXISTS'],
    ['weak_password', 'WEAK_PASSWORD'],
    ['over_email_send_rate_limit', 'RATE_LIMITED'],
    ['flow_state_expired', 'AUTH_LINK_INVALID'],
  ])('maps auth code %s → %s', (code, expected) => {
    expect(toAppError(new AuthApiError('msg', 400, code)).code).toBe(expected);
  });

  it('maps HTTP 429 without a known code to RATE_LIMITED', () => {
    expect(toAppError(new AuthApiError('slow down', 429, undefined)).code).toBe('RATE_LIMITED');
  });

  it('maps retryable fetch errors and fetch TypeErrors to NETWORK_OFFLINE', () => {
    expect(toAppError(new AuthRetryableFetchError('Failed to fetch', 0)).code).toBe('NETWORK_OFFLINE');
    expect(toAppError(new TypeError('Network request failed')).code).toBe('NETWORK_OFFLINE');
  });

  it('maps PostgREST permission errors to FORBIDDEN', () => {
    expect(toAppError({ code: '42501', message: 'permission denied' }).code).toBe('FORBIDDEN');
  });

  it('passes AppErrors through and falls back to UNKNOWN', () => {
    const original = new AppError('INVALID_STATE');
    expect(toAppError(original)).toBe(original);
    expect(toAppError('weird').code).toBe('UNKNOWN');
  });
});
