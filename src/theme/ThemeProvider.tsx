import { createContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '@/store/preferences';

import {
  cardElevation,
  palette,
  radius,
  spacing,
  typography,
  type ColorScheme,
  type ColorTokens,
} from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  cardElevation: ReturnType<typeof cardElevation>;
}

export function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palette[scheme],
    spacing,
    radius,
    typography,
    cardElevation: cardElevation(scheme),
  };
}

export const ThemeContext = createContext<Theme>(buildTheme('light'));

export function ThemeProvider({
  children,
  scheme: forcedScheme,
}: {
  children: ReactNode;
  scheme?: ColorScheme;
}) {
  const systemScheme = useColorScheme();
  const preference = usePreferencesStore((s) => s.theme);
  const resolved: ColorScheme =
    forcedScheme ?? (preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference);
  const theme = useMemo(() => buildTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
