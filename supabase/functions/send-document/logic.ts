import { fieldSchema, type Field } from '../../../shared/fields.ts';
import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  validateForSend,
  type SendRecipient,
} from '../../../shared/send.ts';
import type { RequestContext } from '../_shared/context.ts';
import { z } from '../_shared/deps.ts';
import { loadOwnedDocument } from '../_shared/documents.ts';
import { emailProvider } from '../_shared/email/provider.ts';
import { signatureRequestEmail } from '../_shared/email/templates.ts';
import { logEvent } from '../_shared/events.ts';
import { HttpError } from '../_shared/http.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { issueToken, signingLink } from '../_shared/tokens.ts';

export const SendDocumentInput = z.object({
  document_id: z.uuid(),
  email_subject: z.string().trim().max(200).nullish(),
  email_message: z.string().trim().max(2000).nullish(),
  /** Defaults to 30 days from now; at most a year. */
  expires_at: z.iso.datetime({ offset: true }).nullish(),
  reminder_first_after_days: z.number().int().min(1).max(60).nullish(),
  reminder_repeat_every_days: z.number().int().min(1).max(60).nullish(),
  require_email_otp: z.boolean().default(false),
  allow_decline: z.boolean().default(true),
});

export interface SendDocumentResult {
  document_id: string;
  status: 'in_progress';
  notified: number;
  /** Recipients whose email could not be sent (they can be reminded later). */
  failed: string[];
}

interface ActivatedRecipient {
  recipient_id: string;
  name: string;
  email: string;
  user_id: string | null;
  role: 'signer' | 'approver' | 'viewer' | 'cc';
}

/**
 * Sends a draft (SPEC §6.2, §7, §10): validates completeness with the shared rules, moves it to
 * in_progress and activates group 1 (send_document, one transaction), then issues each activated
 * recipient a fresh token and emails them. Later groups are notified as earlier ones finish (Phase 6).
 */
export async function sendDocument(
  input: z.output<typeof SendDocumentInput>,
  ctx: RequestContext,
): Promise<SendDocumentResult> {
  const doc = await loadOwnedDocument(ctx, input.document_id);
  if (doc.status !== 'draft')
    throw new HttpError('INVALID_STATE', 409, 'This document has already been sent');
  await enforceRateLimit(ctx.admin, `send:${ctx.userId}`, 20, 3600);

  const [{ data: recipientRows, error: rErr }, { data: fieldRows, error: fErr }] = await Promise.all([
    ctx.admin
      .from('document_recipients')
      .select('id, name, email, role, signing_order')
      .eq('document_id', doc.id),
    ctx.admin
      .from('document_fields')
      .select('id, recipient_id, page_number, type, x, y, width, height, required, properties')
      .eq('document_id', doc.id),
  ]);
  if (rErr) throw rErr;
  if (fErr) throw fErr;
  const recipients: SendRecipient[] = (recipientRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    signingOrder: r.signing_order,
  }));
  const fields = (fieldRows ?? []).map((f) => ({
    ...f,
    x: Number(f.x),
    y: Number(f.y),
    width: Number(f.width),
    height: Number(f.height),
  })) as Field[];
  const issues = validateForSend({ hasFile: Boolean(doc.original_path), recipients, fields });
  if (issues.length > 0) {
    throw new HttpError(
      'INVALID_INPUT',
      422,
      `Not ready to send: ${[...new Set(issues.map((i) => i.code))].join(', ')}`,
    );
  }
  // Per-type property validation (fieldSchema) already ran inside validateForSend.
  void fieldSchema;

  const expiresAt = input.expires_at ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000).toISOString();
  const expiresMs = Date.parse(expiresAt);
  if (!(expiresMs > Date.now()) || expiresMs > Date.now() + MAX_EXPIRY_DAYS * 86_400_000) {
    throw new HttpError('INVALID_INPUT', 400, 'Expiry must be in the future and within a year');
  }

  const { data: activated, error: sendError } = await ctx.admin.rpc('send_document', {
    p_document_id: doc.id,
    p_owner_id: ctx.userId,
    p_email_subject: input.email_subject || null,
    p_email_message: input.email_message || null,
    p_expires_at: expiresAt,
    p_reminder_first_after_days: input.reminder_first_after_days ?? null,
    p_reminder_repeat_every_days: input.reminder_repeat_every_days ?? null,
    p_require_email_otp: input.require_email_otp,
    p_allow_decline: input.allow_decline,
  });
  if (sendError) {
    if (sendError.code === 'SF020') throw new HttpError('INVALID_STATE', 409, sendError.message);
    if (sendError.code === 'P0002') throw new HttpError('NOT_FOUND', 404, 'Document not found');
    throw sendError;
  }

  await logEvent(ctx, doc.id, 'DOCUMENT_SENT', 'Document sent', {
    recipients: recipients.length,
    expires_at: expiresAt,
  });

  const { data: owner } = await ctx.admin.from('profiles').select('full_name').eq('id', ctx.userId).single();
  const provider = emailProvider();
  const failed: string[] = [];
  for (const r of (activated ?? []) as ActivatedRecipient[]) {
    if (r.role === 'cc') continue;
    try {
      const token = await issueToken(ctx.admin, r.recipient_id, expiresAt);
      await provider.send(
        signatureRequestEmail({
          recipientName: r.name,
          recipientEmail: r.email,
          senderName: owner?.full_name || ctx.userEmail || 'Someone',
          documentTitle: doc.title,
          subject: input.email_subject ?? null,
          message: input.email_message ?? null,
          link: signingLink(token),
          expiresAt,
          role: r.role,
        }),
      );
      await logEvent(ctx, doc.id, 'RECIPIENT_NOTIFIED', `Signature request sent to ${r.name}`, {
        recipient_id: r.recipient_id,
        channel: 'email',
      });
    } catch (error) {
      // The document is sent either way; a failed email is visible in the audit log and can be
      // re-sent with Remind (Phase 7).
      console.error('notify failed', r.recipient_id, error instanceof Error ? error.message : error);
      failed.push(r.recipient_id);
    }
  }
  return {
    document_id: doc.id,
    status: 'in_progress',
    notified: (activated?.length ?? 0) - failed.length,
    failed,
  };
}
