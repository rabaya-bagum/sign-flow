import { z } from 'zod';

/**
 * Notification preferences (SPEC §5.10, §13), stored in profiles.notification_prefs. Shared by the
 * Account → Notifications screen and the server fan-out. The in-app inbox always records every
 * notice; these switch email and push. Signature-request emails to people signing by link are the
 * product and can't be turned off.
 */
export const NOTIFICATION_TOPICS = ['requests', 'reminders', 'completed', 'activity'] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export const notificationPrefsSchema = z.object({
  email: z.boolean().default(true),
  push: z.boolean().default(true),
  topics: z
    .object({
      /** "Please sign" for documents sent to you. */
      requests: z.boolean().default(true),
      /** Reminders and "expires tomorrow". */
      reminders: z.boolean().default(true),
      /** Completed, declined, voided and expired documents. */
      completed: z.boolean().default(true),
      /** Someone viewed or signed a document you sent. */
      activity: z.boolean().default(true),
    })
    .default({ requests: true, reminders: true, completed: true, activity: true }),
});
export type NotificationPrefs = z.output<typeof notificationPrefsSchema>;

/** Reads stored prefs leniently: unknown or broken values fall back to the defaults. */
export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : notificationPrefsSchema.parse({});
}

/** Whether a channel is on for this topic. */
export function wants(
  prefs: NotificationPrefs,
  channel: 'email' | 'push',
  topic: NotificationTopic,
): boolean {
  return prefs[channel] && prefs.topics[topic];
}

/** Notification types (notifications.type) and their topic. */
export const NOTIFICATION_TYPES = {
  request: 'requests',
  reminder: 'reminders',
  expiring: 'reminders',
  viewed: 'activity',
  signed: 'activity',
  completed: 'completed',
  declined: 'completed',
  voided: 'completed',
  expired: 'completed',
} as const satisfies Record<string, NotificationTopic>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;
