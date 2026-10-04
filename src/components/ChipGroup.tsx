import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

interface ChipGroupProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Horizontal scroll for long rows (filters); wraps otherwise. */
  scroll?: boolean;
  testID?: string;
}

/** Single-select chips (segmented filters, presets). Exposed as a radio group. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  scroll = false,
  testID,
}: ChipGroupProps<T>) {
  const theme = useTheme();
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="radio"
        aria-checked={selected}
        accessibilityLabel={option.label}
        testID={testID ? `${testID}-${option.value}` : undefined}
        onPress={() => onChange(option.value)}
        style={[
          styles.chip,
          {
            borderRadius: theme.radius.full,
            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
            borderColor: selected ? theme.colors.primary : theme.colors.border,
          },
        ]}
      >
        <AppText
          variant="subhead"
          weight="600"
          style={{ color: selected ? theme.colors.onPrimary : theme.colors.textPrimary }}
        >
          {option.label}
        </AppText>
      </Pressable>
    );
  });

  return scroll ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.row}
    >
      {chips}
    </ScrollView>
  ) : (
    <ScrollView
      scrollEnabled={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={[styles.row, styles.wrap]}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  wrap: { flexWrap: 'wrap', flexDirection: 'row' },
  chip: { minHeight: MIN_TOUCH_TARGET - 8, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1 },
});
