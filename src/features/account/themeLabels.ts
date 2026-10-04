import type { ThemePreference } from '@/store/preferences';

export const THEME_OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function themeLabelKey(theme: ThemePreference) {
  return theme === 'system'
    ? 'account.themeSystem'
    : theme === 'light'
      ? 'account.themeLight'
      : 'account.themeDark';
}
