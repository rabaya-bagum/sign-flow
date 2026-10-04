import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type EventType = Database['public']['Enums']['event_type'];

export interface ActivityItem {
  id: number;
  documentId: string;
  documentTitle: string;
  type: EventType;
  description: string;
  actorName: string | null;
  createdAt: string;
}

export const ACTIVITY_PAGE_SIZE = 30;

/** Global feed (SPEC §5.8): every event the user can see, newest first, keyset-paginated. */
export async function listActivity(
  types: readonly EventType[] | null,
  before?: { createdAt: string; id: number },
): Promise<ActivityItem[]> {
  const { data, error } = await supabase.rpc('list_activity', {
    p_limit: ACTIVITY_PAGE_SIZE,
    ...(types ? { p_types: [...types] } : {}),
    ...(before ? { p_before_created_at: before.createdAt, p_before_id: before.id } : {}),
  });
  if (error) throw toAppError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    type: r.type,
    description: r.description,
    actorName: r.actor_name ?? r.actor_email,
    createdAt: r.created_at,
  }));
}

/** One document's audit timeline (SPEC §5.4, §12), newest first. */
export async function documentTimeline(documentId: string): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('document_events')
    .select('id, document_id, type, description, actor_name, actor_email, created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);
  if (error) throw toAppError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentTitle: '',
    type: r.type,
    description: r.description,
    actorName: r.actor_name ?? r.actor_email,
    createdAt: r.created_at,
  }));
}
