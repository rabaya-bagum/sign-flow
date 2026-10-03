import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme, type ColorToken } from '@/theme';

import { AppText } from './AppText';

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Right-aligned value, e.g. a count or current setting. */
  value?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconColor?: ColorToken;
  titleColor?: ColorToken;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  disabled?: boolean;
  /** Bottom hairline separator (omit on the last row of a group). */
  separator?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor = 'textSecondary',
  titleColor = 'textPrimary',
  left,
  right,
  onPress,
  chevron = Boolean(onPress),
  disabled = false,
  separator = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const label = accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? accessibilityRole : undefined}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || !onPress }}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: pressed ? theme.colors.surface : 'transparent',
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      {left ??
        (icon ? (
          <Ionicons name={icon} size={22} color={theme.colors[iconColor]} style={styles.icon} />
        ) : null)}
      <View
        style={[
          styles.body,
          separator
            ? { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
            : null,
        ]}
      >
        <View style={styles.text}>
          <AppText variant="body" color={titleColor} numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="footnote" color="textSecondary" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {value ? (
          <AppText variant="body" color="textSecondary" style={styles.value}>
            {value}
          </AppText>
        ) : null}
        {right}
        {chevron && !disabled ? (
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET + 8 },
  icon: { marginRight: 12 },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 12,
    gap: 8,
  },
  text: { flex: 1, gap: 2 },
  value: { marginLeft: 8 },
});
