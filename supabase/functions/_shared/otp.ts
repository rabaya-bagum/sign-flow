import { sha256Hex } from './crypto.ts';
import type { SupabaseClient } from './deps.ts';
import { emailProvider } from './email/provider.ts';
import { otpEmail } from './email/templates.ts';
import { logEventAs } from './events.ts';
import { HttpError } from './http.ts';
import { enforceRateLimit } from './rateLimit.ts';
import type { Signer } from './signing.ts';

/** Email one-time codes for links that require them (SPEC §7): 6 digits, hashed, 10 minutes, 5 tries. */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

function hashOtp(recipientId: string, code: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(`${recipientId}:${code}`));
}

function requireOtpLink(signer: Signer) {
  if (signer.mode !== 'guest' || !signer.token || signer.token.purpose !== 'sign' || signer.token.revoked) {
    throw new HttpError('INVALID_STATE', 409, 'This link does not use a code');
  }
  if (!signer.document.require_email_otp)
    throw new HttpError('INVALID_STATE', 409, 'This link does not use a code');
  if (!signer.recipient.email) throw new HttpError('INVALID_STATE', 409, 'No email for this recipient');
}

/** Emails a new code. Rate-limited: one a minute and five an hour per recipient. */
export async function requestOtp(admin: SupabaseClient, signer: Signer) {
  requireOtpLink(signer);
  const r = signer.recipient;
  await enforceRateLimit(admin, `otp-send-min:${r.id}`, 1, 60);
  await enforceRateLimit(admin, `otp-send-hour:${r.id}`, 5, 3600);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
  const { error } = await admin.from('recipient_otps').insert({
    recipient_id: r.id,
    otp_hash: await hashOtp(r.id, code),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) throw error;
  await emailProvider().send(
    otpEmail({ recipientName: r.name, recipientEmail: r.email!, documentTitle: signer.document.title, code }),
  );
}

/** Checks a code against the latest one; on success this link is verified for good. */
export async function verifyOtp(admin: SupabaseClient, signer: Signer, code: string) {
  requireOtpLink(signer);
  const r = signer.recipient;
  await enforceRateLimit(admin, `otp-verify:${signer.token!.id}`, 10, 600);
  const { data: otp, error } = await admin
    .from('recipient_otps')
    .select('id, otp_hash, expires_at, attempts, verified_at')
    .eq('recipient_id', r.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (
    !otp ||
    otp.verified_at ||
    Date.parse(otp.expires_at) <= Date.now() ||
    otp.attempts >= OTP_MAX_ATTEMPTS
  ) {
    throw new HttpError('OTP_INVALID', 400, 'Request a new code');
  }
  if ((await hashOtp(r.id, code)) !== otp.otp_hash) {
    await admin
      .from('recipient_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('id', otp.id);
    throw new HttpError('OTP_INVALID', 400, 'That code is not right');
  }
  const now = new Date().toISOString();
  await admin.from('recipient_otps').update({ verified_at: now }).eq('id', otp.id);
  const { error: tokenError } = await admin
    .from('recipient_access_tokens')
    .update({ otp_verified_at: now })
    .eq('id', signer.token!.id);
  if (tokenError) throw tokenError;
  signer.token!.otp_verified_at = now;
  await logEventAs(admin, signer.actor, signer.document.id, 'OTP_VERIFIED', 'Verified with an emailed code');
}
