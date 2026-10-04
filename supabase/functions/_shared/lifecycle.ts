import type { RequestContext } from './context.ts';
import type { SupabaseClient } from './deps.ts';
import { z } from './deps.ts';
import { loadOwnedDocument } from './documents.ts';
import { emailProvider } from './email/provider.ts';
import { noticeEmail } from './email/templates.ts';
import { actorFor, logEvent, logEventAs, SYSTEM_ACTOR } from './events.ts';
import { finalizeDocument } from './finalize.ts';
import { HttpError } from './http.ts';
import { deliver, type Notice } from './notifications.ts';
import { type ActivatedRecipient, type NotifyDocument, notifyActivated } from './notify.ts';
import { enforceRateLimit } from './rateLimit.ts';
import { documentLink } from './tokens.ts';

/**
 * Document lifecycle after sending (SPEC §6.2, §11, §13): Remind, Void, push token registration and
 * the cron-tick sweep (reminders, expiry, "expires tomorrow", finalize retries, uploads-tmp cleanup).
 */

async function notifyDocument(admin: SupabaseClient, documentId: string): Promise<NotifyDocument | null> {
  const { data } = await admin
    .from('documents')
    .select('id, title, owner_id, email_subject, email_message, expires_at')
    .eq('id', documentId)
    .maybeSingle();
  return data?.expires_at ? (data as NotifyDocument) : null;
}

// --- Remind (owner) -----------------------------------------------------------------------------------
export const RemindInput = z.object({
  document_id: z.uuid(),
  /** One recipient; omit to remind everyone whose turn it is. */
  recipient_id: z.uuid().optional(),
});

export interface RemindResult {
  reminded: number;
  /** Recipients skipped because they were reminded in the last 24 hours. */
  skipped: string[];
}

/** Re-sends the request with a fresh link (old links stop working, SPEC §7); 1 per recipient per 24 h. */
export async function remind(
  input: z.output<typeof RemindInput>,
  ctx: RequestContext,
): Promise<RemindResult> {
  const owned = await loadOwnedDocument(ctx, input.document_id);
  if (owned.status !== 'in_progress')
    throw new HttpError('INVALID_STATE', 409, 'Only documents in progress can be reminded');
  await enforceRateLimit(ctx.admin, `remind:${ctx.userId}`, 30, 3600);
  let query = ctx.admin
    .from('document_recipients')
    .select('id, name, email, user_id, role')
    .eq('document_id', owned.id)
    .neq('role', 'cc')
    .in('status', ['sent', 'viewed']);
  if (input.recipient_id) query = query.eq('id', input.recipient_id);
  const { data: targets, error } = await query;
  if (error) throw error;
  if (input.recipient_id && !targets?.length)
    throw new HttpError('INVALID_STATE', 409, 'This recipient has nothing to do right now');

  const claimed: ActivatedRecipient[] = [];
  const skipped: string[] = [];
  for (const t of targets ?? []) {
    const { error: claimError } = await ctx.admin.rpc('claim_manual_reminder', {
      p_recipient_id: t.id,
      p_owner_id: ctx.userId,
    });
    if (claimError) {
      if (claimError.code === 'SF040') {
        if (input.recipient_id) throw new HttpError('RATE_LIMITED', 429, 'Reminded less than 24 hours ago');
        skipped.push(t.id);
        continue;
      }
      if (claimError.code === 'SF030' || claimError.code === 'SF031') {
        if (input.recipient_id) throw new HttpError('INVALID_STATE', 409, claimError.message);
        continue;
      }
      throw claimError;
    }
    claimed.push({ recipient_id: t.id, name: t.name, email: t.email, user_id: t.user_id, role: t.role });
  }
  if (claimed.length === 0) {
    if (skipped.length)
      throw new HttpError('RATE_LIMITED', 429, 'Everyone was reminded in the last 24 hours');
    return { reminded: 0, skipped };
  }
  const doc = await notifyDocument(ctx.admin, owned.id);
  if (!doc) throw new HttpError('INVALID_STATE', 409, 'This document has no expiry date');
  const failed = await notifyActivated(ctx.admin, await actorFor(ctx), doc, claimed, 'reminder');
  return { reminded: claimed.length - failed.length, skipped };
}

// --- Void (owner) -------------------------------------------------------------------------------------
export const VoidDocumentInput = z.object({
  document_id: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
});

/** Voids with a reason (terminal): links stop working; active and finished recipients are told. */
export async function voidDocument(input: z.output<typeof VoidDocumentInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `void:${ctx.userId}`, 20, 3600);
  return voidOwnedDocument(input, ctx);
}

/** Void without the per-user limit: for account deletion, which cancels every document in progress. */
export async function voidOwnedDocument(input: z.output<typeof VoidDocumentInput>, ctx: RequestContext) {
  const owned = await loadOwnedDocument(ctx, input.document_id);
  const { data: recipients, error } = await ctx.admin.rpc('void_document', {
    p_document_id: owned.id,
    p_owner_id: ctx.userId,
    p_reason: input.reason,
  });
  if (error) {
    if (error.code === 'P0002') throw new HttpError('NOT_FOUND', 404, 'Document not found');
    if (error.code === 'SF031') throw new HttpError('INVALID_STATE', 409, error.message);
    if (error.code === 'SF032') throw new HttpError('INVALID_INPUT', 400, error.message);
    throw error;
  }
  await logEvent(ctx, owned.id, 'DOCUMENT_VOIDED', 'Document voided', { reason: input.reason });

  const { data: owner } = await ctx.admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', ctx.userId)
    .single();
  const sender = owner?.full_name || owner?.email || 'The sender';
  const provider = emailProvider();
  const notices: Notice[] = [];
  for (const r of (recipients ?? []) as {
    recipient_id: string;
    name: string;
    email: string | null;
    user_id: string | null;
  }[]) {
    if (r.email) {
      try {
        await provider.send(
          noticeEmail({
            recipientName: r.name,
            recipientEmail: r.email,
            subject: `Cancelled: ${owned.title}`,
            heading: `${sender} cancelled this document`,
            lines: [
              owned.title,
              `Reason: ${input.reason}`,
              'No further action is needed. Earlier links no longer work.',
            ],
          }),
        );
      } catch (e) {
        console.error('void email failed', e instanceof Error ? e.message : e);
      }
    }
    if (r.user_id && r.user_id !== ctx.userId) {
      notices.push({
        userId: r.user_id,
        documentId: owned.id,
        type: 'voided',
        title: `${sender} cancelled a document`,
        body: owned.title,
      });
    }
  }
  await deliver(ctx.admin, notices);
  return { status: 'voided' as const };
}

// --- Push tokens --------------------------------------------------------------------------------------
export const RegisterPushTokenInput = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
});

/** Upserts the device's token for the caller (it moves to them if the device changed accounts). */
export async function registerPushToken(input: z.output<typeof RegisterPushTokenInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `push-token:${ctx.userId}`, 30, 3600);
  const { error } = await ctx.admin.from('push_tokens').upsert(
    {
      user_id: ctx.userId,
      expo_push_token: input.token,
      platform: input.platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' },
  );
  if (error) throw error;
  return { ok: true };
}

// --- cron-tick ----------------------------------------------------------------------------------------
export interface CronTickResult {
  expired: number;
  expiryWarnings: number;
  reminders: number;
  finalized: number;
  tmpDeleted: number;
}

/** One sweep (SPEC §10, §11). Every step claims its rows atomically, so overlapping runs are safe. */
export async function cronTick(admin: SupabaseClient): Promise<CronTickResult> {
  const result: CronTickResult = { expired: 0, expiryWarnings: 0, reminders: 0, finalized: 0, tmpDeleted: 0 };

  // 1. Expiry: documents past expires_at; links revoked by the database function.
  const { data: expired, error: expireError } = await admin.rpc('expire_due_documents');
  if (expireError) throw expireError;
  for (const d of (expired ?? []) as { document_id: string; owner_id: string; title: string }[]) {
    result.expired++;
    await logEventAs(admin, SYSTEM_ACTOR, d.document_id, 'DOCUMENT_EXPIRED', 'Document expired');
    const { data: owner } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', d.owner_id)
      .single();
    await deliver(admin, [
      {
        userId: d.owner_id,
        documentId: d.document_id,
        type: 'expired',
        title: 'A document expired',
        body: d.title,
        email: owner?.email
          ? noticeEmail({
              recipientName: owner.full_name ?? '',
              recipientEmail: owner.email,
              subject: `Expired: ${d.title}`,
              heading: 'This document expired before everyone signed',
              lines: [d.title, 'You can send it again from SignFlow.'],
              link: { href: documentLink(d.document_id), label: 'Open in SignFlow' },
            })
          : undefined,
      },
    ]);
  }

  // 2. "Expires tomorrow" to whoever still has to act (SHOULD).
  const { data: warnings, error: warnError } = await admin.rpc('claim_expiry_warnings');
  if (warnError) throw warnError;
  for (const w of (warnings ?? []) as { document_id: string }[]) {
    const doc = await notifyDocument(admin, w.document_id);
    if (!doc) continue;
    const { data: docRow } = await admin
      .from('documents')
      .select('current_signing_order')
      .eq('id', doc.id)
      .single();
    const { data: active } = await admin
      .from('document_recipients')
      .select('id, name, email, user_id, role')
      .eq('document_id', doc.id)
      .eq('signing_order', docRow?.current_signing_order ?? 0)
      .in('role', ['signer', 'approver'])
      .in('status', ['sent', 'viewed']);
    const targets = (active ?? []).map((r) => ({
      recipient_id: r.id,
      name: r.name,
      email: r.email,
      user_id: r.user_id,
      role: r.role,
    }));
    await notifyActivated(admin, SYSTEM_ACTOR, doc, targets as ActivatedRecipient[], 'expiring');
    result.expiryWarnings += targets.length;
  }

  // 3. Automatic reminders.
  const { data: due, error: dueError } = await admin.rpc('claim_due_reminders');
  if (dueError) throw dueError;
  const byDocument = new Map<string, ActivatedRecipient[]>();
  for (const r of (due ?? []) as (ActivatedRecipient & { document_id: string })[]) {
    byDocument.set(r.document_id, [...(byDocument.get(r.document_id) ?? []), r]);
  }
  for (const [documentId, recipients] of byDocument) {
    const doc = await notifyDocument(admin, documentId);
    if (!doc) continue;
    const failed = await notifyActivated(admin, SYSTEM_ACTOR, doc, recipients, 'reminder');
    result.reminders += recipients.length - failed.length;
  }

  // 4. Retry finalization that failed after the last signature (Phase 6 decision 2).
  const { data: stalled } = await admin.rpc('stalled_finalizations');
  for (const s of (stalled ?? []) as { document_id: string }[]) {
    try {
      if ((await finalizeDocument(admin, s.document_id)).completed) result.finalized++;
    } catch (e) {
      console.error('finalize retry failed', s.document_id, e instanceof Error ? e.message : e);
    }
  }

  // 5. Abandoned image uploads (SPEC §9).
  const { data: stale } = await admin.rpc('stale_tmp_uploads');
  const names = ((stale ?? []) as { name: string }[]).map((s) => s.name);
  if (names.length) {
    const { error } = await admin.storage.from('uploads-tmp').remove(names);
    if (!error) result.tmpDeleted = names.length;
  }
  return result;
}

/** Constant-time comparison for the cron secret. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
