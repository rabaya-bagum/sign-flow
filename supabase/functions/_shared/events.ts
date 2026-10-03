import type { RequestContext } from './context.ts';

export type EventType = 'DOCUMENT_UPLOADED' | 'DOCUMENT_DOWNLOADED' | 'DOCUMENT_VIEWED' | 'DOCUMENT_DELETED';

/** Appends an audit event (SPEC §12.1) with the caller's identity, IP and user agent. */
export async function logEvent(
  ctx: RequestContext,
  documentId: string,
  type: EventType,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  const { data: profile } = await ctx.admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', ctx.userId)
    .maybeSingle();
  const { error } = await ctx.admin.rpc('log_event', {
    p_document_id: documentId,
    p_type: type,
    p_description: description,
    p_actor_user_id: ctx.userId,
    p_actor_name: profile?.full_name ?? null,
    p_actor_email: profile?.email ?? ctx.userEmail,
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
    p_metadata: metadata,
  });
  if (error) throw error;
}
