import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

interface SearchFieldProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  accessibilityLabel: string;
  clearLabel: string;
}

export function SearchField({
  value,
  onChangeText,
  accessibilityLabel,
  clearLabel,
  ...rest
}: SearchFieldProps) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
      <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="search"
        placeholderTextColor={theme.colors.textTertiary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[styles.input, theme.typography.body, { color: theme.colors.textPrimary }]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          onPress={() => onChangeText('')}
          hitSlop={8}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, minHeight: MIN_TOUCH_TARGET },
  input: { flex: 1, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 8, paddingVertical: 10 },
  clear: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
