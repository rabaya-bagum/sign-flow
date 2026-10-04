import { type NotificationPrefs, parseNotificationPrefs } from '@shared/notifications';

import { toAppError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

export interface InboxItem {
  id: string;
  documentId: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export const INBOX_PAGE_SIZE = 30;

/** In-app inbox, newest first (RLS: own rows only). `before` is the last row's created_at. */
export async function listNotifications(before?: string): Promise<InboxItem[]> {
  let query = supabase
    .from('notifications')
    .select('id, document_id, type, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(INBOX_PAGE_SIZE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw toAppError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    type: r.type,
    title: r.title,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw toAppError(error);
  return count ?? 0;
}

/** Marks some (or all unread) notifications read. */
export async function markRead(ids?: string[]): Promise<void> {
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (ids) query = query.in('id', ids);
  const { error } = await query;
  if (error) throw toAppError(error);
}

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .single();
  if (error) throw toAppError(error);
  return parseNotificationPrefs(data.notification_prefs);
}

export async function saveNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs as unknown as NonNullable<Json> })
    .eq('id', userId);
  if (error) throw toAppError(error);
}

export function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<{ ok: true }> {
  return invokeFunction('register-push-token', { token, platform });
}

/** Removes this device's token at sign-out (RLS: own tokens only). */
export async function removePushToken(token: string): Promise<void> {
  await supabase.from('push_tokens').delete().eq('expo_push_token', token);
}
