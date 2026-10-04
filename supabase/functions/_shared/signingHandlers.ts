import {
  DECLINE_REASON_MAX,
  submissionAssetsSchema,
  submissionValueSchema,
} from '../../../shared/signing.ts';
import type { RequestContext } from './context.ts';
import { z } from './deps.ts';
import { loadOwnedDocument } from './documents.ts';
import { finalizeDocument } from './finalize.ts';
import { requestOtp, verifyOtp } from './otp.ts';
import { enforceRateLimit } from './rateLimit.ts';
import {
  acceptConsent,
  declineSigning,
  type GuestRequest,
  guestDownload,
  openSession,
  resolveAccountSigner,
  resolveGuestSigner,
  submitSigning,
} from './signing.ts';

/** Request schemas and handlers for every signing endpoint (one Edge Function each). */

const token = z.string().min(1).max(100);
const documentId = z.uuid();
const submission = {
  values: z.array(submissionValueSchema).max(500),
  assets: submissionAssetsSchema.default({}),
  /** IANA time zone for date_signed fields; invalid names fall back to UTC. */
  timezone: z.string().max(64).nullish(),
};
const reason = z.string().trim().min(1).max(DECLINE_REASON_MAX);
const disclosureVersion = z.string().min(1).max(32);

// --- In-app (signed-in recipient) ---------------------------------------------------------------------
export const SigningSessionInput = z.object({ document_id: documentId });
export async function signingSession(input: z.output<typeof SigningSessionInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `session:${ctx.userId}`, 120, 300);
  return openSession(ctx.admin, await resolveAccountSigner(ctx, input.document_id));
}

export const EsignConsentInput = z.object({ document_id: documentId, disclosure_version: disclosureVersion });
export async function esignConsent(input: z.output<typeof EsignConsentInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `consent:${ctx.userId}`, 60, 3600);
  await acceptConsent(
    ctx.admin,
    await resolveAccountSigner(ctx, input.document_id),
    input.disclosure_version,
  );
  return { ok: true };
}

export const SubmitSigningInput = z.object({ document_id: documentId, ...submission });
export async function submitSigningHandler(input: z.output<typeof SubmitSigningInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `submit:${ctx.userId}`, 30, 3600);
  return submitSigning(ctx.admin, await resolveAccountSigner(ctx, input.document_id), input);
}

export const DeclineInput = z.object({ document_id: documentId, reason });
export async function decline(input: z.output<typeof DeclineInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `decline:${ctx.userId}`, 20, 3600);
  await declineSigning(ctx.admin, await resolveAccountSigner(ctx, input.document_id), input.reason);
  return { ok: true };
}

/** Owner retry when finalization failed after the last signature (everything else was saved). */
export const FinalizeDocumentInput = z.object({ document_id: documentId });
export async function finalizeDocumentHandler(
  input: z.output<typeof FinalizeDocumentInput>,
  ctx: RequestContext,
) {
  const doc = await loadOwnedDocument(ctx, input.document_id);
  if (doc.status === 'completed') return { status: 'completed' };
  await enforceRateLimit(ctx.admin, `finalize:${ctx.userId}`, 10, 3600);
  await finalizeDocument(ctx.admin, doc.id);
  return { status: 'completed' };
}

// --- Guest (signing link) -----------------------------------------------------------------------------
export const GuestOpenInput = z.object({ token });
export async function guestOpen(input: z.output<typeof GuestOpenInput>, req: GuestRequest) {
  return openSession(req.admin, await resolveGuestSigner(req, input.token));
}

export const GuestConsentInput = z.object({ token, disclosure_version: disclosureVersion });
export async function guestConsent(input: z.output<typeof GuestConsentInput>, req: GuestRequest) {
  await acceptConsent(req.admin, await resolveGuestSigner(req, input.token), input.disclosure_version);
  return { ok: true };
}

export const GuestSubmitInput = z.object({ token, ...submission });
export async function guestSubmit(input: z.output<typeof GuestSubmitInput>, req: GuestRequest) {
  return submitSigning(req.admin, await resolveGuestSigner(req, input.token), input);
}

export const GuestDeclineInput = z.object({ token, reason });
export async function guestDecline(input: z.output<typeof GuestDeclineInput>, req: GuestRequest) {
  await declineSigning(req.admin, await resolveGuestSigner(req, input.token), input.reason);
  return { ok: true };
}

export const GuestDownloadInput = z.object({
  token,
  kind: z.enum(['original', 'completed', 'certificate']).default('completed'),
});
export async function guestDownloadHandler(input: z.output<typeof GuestDownloadInput>, req: GuestRequest) {
  return guestDownload(req.admin, await resolveGuestSigner(req, input.token), input.kind);
}

export const GuestOtpInput = z.discriminatedUnion('action', [
  z.object({ token, action: z.literal('request') }),
  z.object({
    token,
    action: z.literal('verify'),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  }),
]);
export async function guestOtp(input: z.output<typeof GuestOtpInput>, req: GuestRequest) {
  const signer = await resolveGuestSigner(req, input.token);
  if (input.action === 'request') await requestOtp(req.admin, signer);
  else await verifyOtp(req.admin, signer, input.code);
  return { ok: true };
}
