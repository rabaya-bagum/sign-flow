import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
}

export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const theme = useTheme();
  const dimensions = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[styles.base, dimensions, { backgroundColor: theme.colors.primarySubtle }]}
    >
      {uri ? (
        <Image source={{ uri }} style={dimensions} accessibilityIgnoresInvertColors />
      ) : (
        <AppText
          variant={size >= 56 ? 'title3' : 'subhead'}
          weight="600"
          color="primary"
          maxFontSizeMultiplier={1.2}
        >
          {initialsFor(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
