import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import type { FieldType } from '@shared/fields';

export const FIELD_ICONS: Record<FieldType, ComponentProps<typeof Ionicons>['name']> = {
  signature: 'create-outline',
  initials: 'pencil-outline',
  full_name: 'person-outline',
  email: 'mail-outline',
  date_signed: 'calendar-outline',
  text: 'text-outline',
  checkbox: 'checkbox-outline',
  radio: 'radio-button-on-outline',
  dropdown: 'chevron-down-circle-outline',
};

/** 15% alpha fill for a recipient colour (#RRGGBB → #RRGGBB26). */
export function fieldFill(color: string): string {
  return `${color}26`;
}
