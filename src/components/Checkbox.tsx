import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name for the checkbox. */
  accessibilityLabel: string;
  children?: ReactNode;
  /** Already-translated error message. */
  error?: string;
  testID?: string;
}

export function Checkbox({ checked, onChange, accessibilityLabel, children, error, testID }: CheckboxProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(!checked)}
          accessibilityRole="checkbox"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ checked }}
          accessibilityHint={error}
          testID={testID}
          style={styles.hit}
        >
          <View
            style={[
              styles.box,
              {
                borderRadius: 6,
                borderColor: error
                  ? theme.colors.danger
                  : checked
                    ? theme.colors.primary
                    : theme.colors.textTertiary,
                backgroundColor: checked ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            {checked ? <Ionicons name="checkmark" size={16} color={theme.colors.onPrimary} /> : null}
          </View>
        </Pressable>
        <View style={styles.label}>{children}</View>
      </View>
      {error ? (
        <AppText variant="footnote" color="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  hit: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  box: { width: 24, height: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
});
