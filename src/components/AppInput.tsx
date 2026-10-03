import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';

export interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Already-translated error message. */
  error?: string;
  hint?: string;
  ref?: Ref<TextInput>;
}

export function AppInput({
  label,
  error,
  hint,
  secureTextEntry,
  editable = true,
  ref,
  ...rest
}: AppInputProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isSecret = Boolean(secureTextEntry);

  const borderColor = error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border;
  const description = error ?? hint;

  return (
    <View style={styles.container}>
      <AppText variant="subhead" color="textSecondary" weight="500" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderRadius: theme.radius.md,
            backgroundColor: editable ? theme.colors.surfaceElevated : theme.colors.surface,
          },
        ]}
      >
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          secureTextEntry={isSecret && !revealed}
          accessibilityLabel={label}
          accessibilityHint={description}
          accessibilityState={{ disabled: !editable }}
          placeholderTextColor={theme.colors.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, theme.typography.body, { color: theme.colors.textPrimary }]}
        />
        {isSecret ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            style={styles.toggle}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {description ? (
        <AppText
          variant="footnote"
          color={error ? 'danger' : 'textSecondary'}
          style={styles.description}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          accessibilityRole={error ? 'alert' : undefined}
        >
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', marginBottom: 16 },
  label: { marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: MIN_TOUCH_TARGET + 6 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  toggle: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: { marginTop: 6 },
});
