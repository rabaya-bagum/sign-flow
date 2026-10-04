import type { TextStyle, ViewStyle } from 'react-native';

// Design tokens (SPEC §3). Components read these through useTheme(); never hard-code colors.

export const palette = {
  light: {
    background: '#FFFFFF',
    surface: '#F7F8FA',
    surfaceElevated: '#FFFFFF',
    border: '#E4E7EC',
    textPrimary: '#1F2328',
    textSecondary: '#5B6270',
    textTertiary: '#8A919E',
    primary: '#2B59D9',
    primaryPressed: '#2349B5',
    primarySubtle: '#EAF0FD',
    onPrimary: '#FFFFFF',
    success: '#1B7D45',
    warning: '#9E5F00',
    danger: '#C93A3A',
    fieldHighlight: '#FFF4D6',
    // Signature pad: light "paper" in both themes so ink colours stay true (SPEC §5.7).
    paper: '#FFFFFF',
    paperLine: '#AEB4BE',
    paperText: '#5B6270',
  },
  dark: {
    background: '#0E1013',
    surface: '#171A1F',
    surfaceElevated: '#1E2228',
    border: '#2C313A',
    textPrimary: '#ECEEF1',
    textSecondary: '#A6ADB8',
    textTertiary: '#757D8A',
    primary: '#6E93FF',
    primaryPressed: '#8AA8FF',
    primarySubtle: '#1C2643',
    onPrimary: '#0E1013',
    success: '#3FBF77',
    warning: '#E3A23B',
    danger: '#F06A6A',
    fieldHighlight: '#3A3016',
    // Signature pad: light "paper" in both themes so ink colours stay true (SPEC §5.7).
    paper: '#FFFFFF',
    paperLine: '#AEB4BE',
    paperText: '#5B6270',
  },
} as const;

/**
 * Field colours per recipient (SPEC §5.6): 8 hues that stay distinguishable in light and dark mode and
 * against white paper. Index = recipient position.
 */
export const recipientColors = [
  '#2B59D9',
  '#C2410C',
  '#15803D',
  '#7C3AED',
  '#DC2626',
  '#0E7490',
  '#A16207',
  '#BE185D',
] as const;

export function recipientColor(index: number): string {
  return recipientColors[
    ((index % recipientColors.length) + recipientColors.length) % recipientColors.length
  ]!;
}

export type ColorScheme = keyof typeof palette;
export type ColorTokens = { [K in keyof (typeof palette)['light']]: string };
export type ColorToken = keyof ColorTokens;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>;

export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/** Minimum Dynamic Type multiplier we allow when a layout must cap scaling (SPEC §3.2). */
export const MIN_FONT_SCALE_CAP = 1.5;

/** Minimum touch target (SPEC §16). */
export const MIN_TOUCH_TARGET = 44;

export function cardElevation(scheme: ColorScheme): ViewStyle {
  // Light: a whisper of shadow; dark: rely on the border only.
  return scheme === 'light'
    ? {
        shadowColor: '#101828',
        shadowOpacity: 0.05,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }
    : {};
}

export const motion = {
  fast: 150,
  standard: 200,
  slow: 250,
} as const;
