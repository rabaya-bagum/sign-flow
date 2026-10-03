import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

interface ProgressBarProps {
  /** 0..1, or null for an indeterminate (busy) state. */
  value: number | null;
  accessibilityLabel: string;
  testID?: string;
}

export function ProgressBar({ value, accessibilityLabel, testID }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = value === null ? null : Math.min(1, Math.max(0, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={clamped === null ? undefined : { min: 0, max: 100, now: Math.round(clamped * 100) }}
      accessibilityState={{ busy: true }}
      testID={testID}
      style={[styles.track, { backgroundColor: theme.colors.border, borderRadius: theme.radius.full }]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: theme.colors.primary,
            borderRadius: theme.radius.full,
            width: `${Math.round((clamped ?? 0.3) * 100)}%`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: 8 },
});
