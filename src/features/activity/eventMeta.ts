import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { ColorToken } from '@/theme';

import type { EventType } from './api';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** Icon and colour per audit event (SPEC §5.8 rows). */
export const EVENT_META: Record<EventType, { icon: Icon; color: ColorToken }> = {
  DOCUMENT_CREATED: { icon: 'document-outline', color: 'textSecondary' },
  DOCUMENT_UPLOADED: { icon: 'cloud-upload-outline', color: 'textSecondary' },
  DOCUMENT_RENAMED: { icon: 'pencil-outline', color: 'textSecondary' },
  DOCUMENT_SENT: { icon: 'paper-plane-outline', color: 'primary' },
  RECIPIENT_NOTIFIED: { icon: 'mail-outline', color: 'textSecondary' },
  DOCUMENT_VIEWED: { icon: 'eye-outline', color: 'textSecondary' },
  ESIGN_CONSENT_ACCEPTED: { icon: 'shield-checkmark-outline', color: 'textSecondary' },
  OTP_VERIFIED: { icon: 'key-outline', color: 'textSecondary' },
  FIELDS_COMPLETED: { icon: 'create-outline', color: 'textSecondary' },
  DOCUMENT_SIGNED: { icon: 'create-outline', color: 'success' },
  DOCUMENT_APPROVED: { icon: 'checkmark-circle-outline', color: 'success' },
  DOCUMENT_DECLINED: { icon: 'close-circle-outline', color: 'danger' },
  REMINDER_SENT: { icon: 'alarm-outline', color: 'warning' },
  RECIPIENT_UPDATED: { icon: 'person-outline', color: 'textSecondary' },
  DOCUMENT_COMPLETED: { icon: 'checkmark-done-outline', color: 'success' },
  DOCUMENT_DOWNLOADED: { icon: 'download-outline', color: 'textSecondary' },
  DOCUMENT_VOIDED: { icon: 'ban-outline', color: 'danger' },
  DOCUMENT_EXPIRED: { icon: 'time-outline', color: 'warning' },
  DOCUMENT_DELETED: { icon: 'trash-outline', color: 'textSecondary' },
};

/** Activity tab filters (SHOULD): groups of event types. */
export const ACTIVITY_FILTERS = {
  all: null,
  signatures: ['DOCUMENT_SIGNED', 'DOCUMENT_APPROVED'],
  sent: ['DOCUMENT_SENT', 'REMINDER_SENT'],
  views: ['DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED'],
  completed: ['DOCUMENT_COMPLETED'],
  closed: ['DOCUMENT_DECLINED', 'DOCUMENT_VOIDED', 'DOCUMENT_EXPIRED'],
} as const satisfies Record<string, readonly EventType[] | null>;
export type ActivityFilter = keyof typeof ACTIVITY_FILTERS;
