import {
  NOTIFICATION_TYPES,
  type NotificationType,
  parseNotificationPrefs,
  wants,
} from '../../../shared/notifications.ts';
import type { SupabaseClient } from './deps.ts';
import { type EmailMessage, emailProvider } from './email/provider.ts';

/** One notice for one account holder (SPEC §13). */
export interface Notice {
  userId: string;
  documentId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Sent only if the person allows email for this topic. */
  email?: EmailMessage;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
}

/** Expo Push API (SPEC §2). EXPO_PUSH_URL can point elsewhere in tests. */
async function sendPush(admin: SupabaseClient, messages: PushMessage[]) {
  if (messages.length === 0) return;
  const url = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Expo push ${res.status}`);
    const tickets =
      ((await res.json()) as { data?: { status: string; details?: { error?: string } }[] }).data ?? [];
    // Tokens of uninstalled apps are removed so they aren't retried forever.
    const dead = batch
      .filter((_, j) => tickets[j]?.details?.error === 'DeviceNotRegistered')
      .map((m) => m.to);
    if (dead.length) await admin.from('push_tokens').delete().in('expo_push_token', dead);
  }
}

/**
 * Delivers notices: always to the in-app inbox, then push and email where the person's preferences
 * allow (profiles.notification_prefs). Never throws for a delivery failure: notifications must not
 * undo or block the action that caused them.
 */
export async function deliver(admin: SupabaseClient, notices: readonly Notice[]): Promise<void> {
  if (notices.length === 0) return;
  try {
    const userIds = [...new Set(notices.map((n) => n.userId))];
    const [{ error: insertError }, { data: profiles }, { data: tokens }] = await Promise.all([
      admin.from('notifications').insert(
        notices.map((n) => ({
          user_id: n.userId,
          document_id: n.documentId,
          type: n.type,
          title: n.title.slice(0, 200),
          body: n.body.slice(0, 1000),
        })),
      ),
      admin.from('profiles').select('id, notification_prefs').in('id', userIds),
      admin.from('push_tokens').select('user_id, expo_push_token').in('user_id', userIds),
    ]);
    if (insertError) console.error('notification insert failed', insertError.message);
    const prefs = new Map(
      (profiles ?? []).map((p) => [p.id as string, parseNotificationPrefs(p.notification_prefs)]),
    );

    const push: PushMessage[] = [];
    const provider = notices.some((n) => n.email) ? emailProvider() : null;
    for (const notice of notices) {
      const p = prefs.get(notice.userId) ?? parseNotificationPrefs({});
      const topic = NOTIFICATION_TYPES[notice.type];
      if (wants(p, 'push', topic)) {
        for (const t of (tokens ?? []).filter((t) => t.user_id === notice.userId)) {
          push.push({
            to: t.expo_push_token,
            title: notice.title,
            body: notice.body,
            data: { documentId: notice.documentId, type: notice.type },
            sound: 'default',
          });
        }
      }
      if (notice.email && provider && wants(p, 'email', topic)) {
        try {
          await provider.send(notice.email);
        } catch (e) {
          console.error('notification email failed', e instanceof Error ? e.message : e);
        }
      }
    }
    await sendPush(admin, push).catch((e) =>
      console.error('push failed', e instanceof Error ? e.message : e),
    );
  } catch (e) {
    console.error('deliver failed', e instanceof Error ? e.message : e);
  }
}
