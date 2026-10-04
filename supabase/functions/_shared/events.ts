import type { RequestContext } from './context.ts';

export type EventType =
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DOWNLOADED'
  | 'DOCUMENT_VIEWED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_SENT'
  | 'RECIPIENT_NOTIFIED'
  | 'RECIPIENT_UPDATED'
  | 'ESIGN_CONSENT_ACCEPTED'
  | 'OTP_VERIFIED'
  | 'FIELDS_COMPLETED'
  | 'DOCUMENT_SIGNED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_DECLINED'
  | 'DOCUMENT_COMPLETED'
  | 'DOCUMENT_VOIDED'
  | 'DOCUMENT_EXPIRED'
  | 'REMINDER_SENT';

/** Appends an audit event (SPEC §12.1) with the caller's identity, IP and user agent. */
async function actor(ctx: RequestContext) {
  const { data: profile } = await ctx.admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', ctx.userId)
    .maybeSingle();
  return { name: profile?.full_name ?? null, email: profile?.email ?? ctx.userEmail };
}

/**
 * Logs DOCUMENT_VIEWED unless this user already viewed the document in the last 30 minutes (atomic,
 * in log_document_view). Returns whether an event was written.
 */
export async function logDocumentView(ctx: RequestContext, documentId: string): Promise<boolean> {
  const { name, email } = await actor(ctx);
  const { data, error } = await ctx.admin.rpc('log_document_view', {
    p_document_id: documentId,
    p_actor_user_id: ctx.userId,
    p_actor_name: name,
    p_actor_email: email,
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
  });
  if (error) throw error;
  return data === true;
}

export async function logEvent(
  ctx: RequestContext,
  documentId: string,
  type: EventType,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  const { name, email } = await actor(ctx);
  const { error } = await ctx.admin.rpc('log_event', {
    p_document_id: documentId,
    p_type: type,
    p_description: description,
    p_actor_user_id: ctx.userId,
    p_actor_name: name,
    p_actor_email: email,
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
    p_metadata: metadata,
  });
  if (error) throw error;
}
