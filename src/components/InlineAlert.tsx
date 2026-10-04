import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

interface InlineAlertProps {
  message: string;
  tone?: 'error' | 'success' | 'info';
  testID?: string;
}

/** Form-level message (API errors, confirmations). Announced to screen readers when it appears. */
export function InlineAlert({ message, tone = 'error', testID }: InlineAlertProps) {
  const theme = useTheme();
  const color =
    tone === 'error' ? theme.colors.danger : tone === 'success' ? theme.colors.success : theme.colors.primary;
  const icon =
    tone === 'error'
      ? 'alert-circle-outline'
      : tone === 'success'
        ? 'checkmark-circle-outline'
        : 'information-circle-outline';
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[
        styles.box,
        { borderColor: color, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <AppText variant="subhead" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  text: { flex: 1 },
});
