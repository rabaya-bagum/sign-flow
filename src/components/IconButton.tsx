import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme, type ColorToken } from '@/theme';

interface IconButtonProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Required: icon-only controls must be labelled for screen readers. */
  accessibilityLabel: string;
  onPress?: () => void;
  color?: ColorToken;
  size?: number;
  /** Shows a small dot (e.g. unread notifications). */
  badge?: boolean;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color = 'textPrimary',
  size = 24,
  badge,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: theme.radius.full, backgroundColor: pressed ? theme.colors.surface : 'transparent' },
      ]}
    >
      <Ionicons name={icon} size={size} color={theme.colors[color]} />
      {badge ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.danger, borderColor: theme.colors.background },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 9, right: 9, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
