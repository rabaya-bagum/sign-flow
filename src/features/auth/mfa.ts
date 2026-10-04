import { AppError } from '@shared/errors';

import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/**
 * Two-factor authentication with an authenticator app (TOTP, SPEC §5.10). Once a factor is verified,
 * the database and Edge Functions accept only sessions that passed it (JWT aal = 'aal2'), so the app
 * asks for the code right after the password or social sign-in.
 */

export { needsSecondFactor, sessionAal } from './session';

export interface TotpFactor {
  id: string;
  friendlyName: string | null;
  createdAt: string;
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw toAppError(error);
  return data.totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at }));
}

export interface TotpEnrollment {
  factorId: string;
  /** SVG data URL of the otpauth:// QR code. */
  qrCode: string;
  /** Base32 key for typing into the app by hand. */
  secret: string;
  /** otpauth:// link that opens an authenticator app on the same device. */
  uri: string;
}

/** Starts setup. Unfinished earlier attempts are removed first so they don't pile up. */
export async function enrollTotp(): Promise<TotpEnrollment> {
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified')
      await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'SignFlow',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw toAppError(error);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Checks a 6-digit code: finishes setup, or passes the sign-in challenge. Upgrades the session to aal2. */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw toAppError(error);
}

/** Sign-in challenge: verifies the code against the account's verified factor. */
export async function passSecondFactor(code: string): Promise<void> {
  const [factor] = await listTotpFactors();
  if (!factor) throw new AppError('INVALID_STATE', 'No authenticator set up');
  await verifyTotp(factor.id, code);
}

/** Turns 2FA off (needs an aal2 session, which a user with a factor always has in the app). */
export async function removeTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw toAppError(error);
  // Refresh so the session no longer lists the factor.
  await supabase.auth.refreshSession();
}
