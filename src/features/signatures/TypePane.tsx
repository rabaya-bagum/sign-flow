import { useFonts } from 'expo-font';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppInput, AppText } from '@/components';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { FONT_FAMILIES, SIGNATURE_FONTS } from './fonts';
import { INK_COLORS, type InkColor } from './ink';
import type { SignatureKind } from './types';

interface TypePaneProps {
  kind: SignatureKind;
  text: string;
  onChangeText: (text: string) => void;
  fontKey: string;
  onChangeFont: (key: string) => void;
  ink: InkColor;
}

/** The accessible path (SPEC §5.7): a text field and a radio list of fonts, no gestures. */
export function TypePane({ kind, text, onChangeText, fontKey, onChangeFont, ink }: TypePaneProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [fontsLoaded] = useFonts(FONT_FAMILIES);
  const sample = text.trim() || t(`signatures.typeNameLabel_${kind}`);
  return (
    <View>
      <AppInput
        label={t(`signatures.typeNameLabel_${kind}`)}
        value={text}
        onChangeText={onChangeText}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={kind === 'initials' ? 4 : 60}
        testID="type-text"
      />
      <AppText variant="subhead" color="textSecondary" style={{ marginBottom: theme.spacing.sm }}>
        {t('signatures.fontLabel')}
      </AppText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('signatures.fontLabel')}
        style={{ gap: theme.spacing.sm }}
      >
        {SIGNATURE_FONTS.map((font) => {
          const selected = font.key === fontKey;
          return (
            <Pressable
              key={font.key}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={t('signatures.fontOptionLabel', { font: font.label })}
              onPress={() => onChangeFont(font.key)}
              testID={`type-font-${font.key}`}
              style={[
                styles.option,
                {
                  backgroundColor: theme.colors.paper,
                  borderRadius: theme.radius.md,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  borderWidth: selected ? 2 : 1,
                },
              ]}
            >
              <AppText
                numberOfLines={1}
                adjustsFontSizeToFit
                importantForAccessibility="no"
                style={{
                  fontFamily: fontsLoaded ? font.family : undefined,
                  fontSize: 30,
                  lineHeight: 44,
                  color: INK_COLORS[ink],
                }}
              >
                {sample}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: MIN_TOUCH_TARGET + 16, justifyContent: 'center', paddingHorizontal: 16 },
});
