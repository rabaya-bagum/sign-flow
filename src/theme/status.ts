import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

import type { ColorTokens } from './tokens';

// Per-viewer display statuses (SPEC §3.3, §6.3). Values match public.my_documents().display_status.
export const DISPLAY_STATUSES = [
  'draft',
  'needs_signature',
  'waiting',
  'completed',
  'declined',
  'voided',
  'expired',
] as const;

export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export function isDisplayStatus(value: unknown): value is DisplayStatus {
  return typeof value === 'string' && (DISPLAY_STATUSES as readonly string[]).includes(value);
}

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface StatusPresentation {
  foreground: string;
  background: string;
  icon: IconName;
  strikethrough: boolean;
}

export function statusPresentation(status: DisplayStatus, colors: ColorTokens): StatusPresentation {
  switch (status) {
    case 'needs_signature':
      return {
        foreground: colors.warning,
        background: colors.surface,
        icon: 'create-outline',
        strikethrough: false,
      };
    case 'waiting':
      return {
        foreground: colors.primary,
        background: colors.primarySubtle,
        icon: 'time-outline',
        strikethrough: false,
      };
    case 'completed':
      return {
        foreground: colors.success,
        background: colors.surface,
        icon: 'checkmark-circle-outline',
        strikethrough: false,
      };
    case 'declined':
      return {
        foreground: colors.danger,
        background: colors.surface,
        icon: 'close-circle-outline',
        strikethrough: false,
      };
    case 'voided':
      return {
        foreground: colors.textSecondary,
        background: colors.surface,
        icon: 'remove-circle-outline',
        strikethrough: true,
      };
    case 'expired':
      return {
        foreground: colors.textSecondary,
        background: colors.surface,
        icon: 'hourglass-outline',
        strikethrough: false,
      };
    case 'draft':
      return {
        foreground: colors.textSecondary,
        background: colors.surface,
        icon: 'pencil-outline',
        strikethrough: false,
      };
  }
}
