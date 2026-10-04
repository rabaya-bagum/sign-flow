import { StyleSheet, Switch, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

interface SwitchRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  separator?: boolean;
  testID?: string;
}

/** A labelled on/off setting row (Account → Notifications). The whole row is one switch for screen readers. */
export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  separator,
  testID,
}: SwitchRowProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.spacing.lg },
        separator
          ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }
          : null,
      ]}
    >
      <View style={styles.text} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <AppText color={disabled ? 'textTertiary' : 'textPrimary'}>{title}</AppText>
        {subtitle ? (
          <AppText variant="footnote" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        aria-checked={value}
        aria-disabled={disabled}
        trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH_TARGET + 12,
    paddingVertical: 8,
  },
  text: { flex: 1, gap: 2 },
});
