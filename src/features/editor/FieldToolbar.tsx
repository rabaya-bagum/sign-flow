import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { MUST_FIELD_TYPES, SHOULD_FIELD_TYPES, type FieldType } from '@shared/fields';

import { AppText } from '@/components';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { FIELD_ICONS } from './fieldMeta';

/** Bottom toolbar: MUST field types, then SHOULD (SPEC §1.2). Tap a tool, then tap the page. */
export function FieldToolbar({
  tool,
  onSelect,
}: {
  tool: FieldType | null;
  onSelect: (tool: FieldType | null) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: theme.spacing.md, gap: theme.spacing.xs }]}
      accessibilityLabel={t('editor.toolbarLabel')}
      testID="field-toolbar"
    >
      {[...MUST_FIELD_TYPES, ...SHOULD_FIELD_TYPES].map((type) => {
        const active = tool === type;
        return (
          <Pressable
            key={type}
            onPress={() => onSelect(active ? null : type)}
            accessibilityRole="button"
            aria-selected={active}
            accessibilityLabel={t(`editor.type_${type}`)}
            accessibilityHint={t('editor.toolHint')}
            testID={`tool-${type}`}
            style={[
              styles.tool,
              {
                borderRadius: theme.radius.md,
                backgroundColor: active ? theme.colors.primary : theme.colors.surface,
              },
            ]}
          >
            <Ionicons
              name={FIELD_ICONS[type]}
              size={22}
              color={active ? theme.colors.onPrimary : theme.colors.textPrimary}
            />
            <AppText
              variant="caption"
              weight="600"
              style={{ color: active ? theme.colors.onPrimary : theme.colors.textPrimary }}
            >
              {t(`editor.type_${type}`)}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingVertical: 8 },
  tool: {
    minWidth: 72,
    minHeight: MIN_TOUCH_TARGET + 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
});
