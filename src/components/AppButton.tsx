import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface AppButtonProps {
  title: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: ViewStyle;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  accessibilityHint,
  testID,
  style,
}: AppButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const inactive = disabled || loading;

  const palette: Record<AppButtonVariant, { bg: string; pressed: string; fg: string; border: string }> = {
    primary: {
      bg: colors.primary,
      pressed: colors.primaryPressed,
      fg: colors.onPrimary,
      border: colors.primary,
    },
    secondary: {
      bg: colors.surfaceElevated,
      pressed: colors.surface,
      fg: colors.primary,
      border: colors.border,
    },
    ghost: { bg: 'transparent', pressed: colors.primarySubtle, fg: colors.primary, border: 'transparent' },
    destructive: {
      bg: colors.surfaceElevated,
      pressed: colors.surface,
      fg: colors.danger,
      border: colors.border,
    },
  };
  const p = palette[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.xl,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={p.fg} accessibilityElementsHidden importantForAccessibility="no" />
        ) : icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={p.fg}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
        <AppText variant="headline" style={{ color: p.fg }} numberOfLines={2} align="center">
          {title}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Math.max(MIN_TOUCH_TARGET, 50),
    borderWidth: StyleSheet.hairlineWidth * 2,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
