import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import type { Recipient } from '@/features/documents/types';
import { MIN_TOUCH_TARGET, recipientColor, useTheme } from '@/theme';

interface RecipientChipsProps {
  recipients: Recipient[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onEdit: (recipient: Recipient) => void;
  onAdd: () => void;
}

/** Who new fields are for. Each recipient has its own colour (SPEC §5.6); long-press or ⋯ to edit. */
export function RecipientChips({ recipients, activeId, onSelect, onEdit, onAdd }: RecipientChipsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      // A horizontal ScrollView would otherwise grow to fill the column (web).
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: theme.spacing.md, gap: theme.spacing.xs }]}
      accessibilityLabel={t('editor.recipientsLabel')}
    >
      {recipients.map((r, i) => {
        const active = r.id === activeId;
        const color = recipientColor(i);
        return (
          <View
            key={r.id}
            style={[
              styles.chip,
              {
                borderRadius: theme.radius.full,
                borderColor: color,
                backgroundColor: active ? color : 'transparent',
              },
            ]}
          >
            <Pressable
              onPress={() => onSelect(r.id)}
              onLongPress={() => onEdit(r)}
              accessibilityRole="radio"
              aria-checked={active}
              accessibilityLabel={`${r.name}${r.email ? `, ${r.email}` : `, ${t('editor.noEmail')}`}`}
              testID={`recipient-chip-${i}`}
              style={styles.chipMain}
            >
              <View style={[styles.dot, { backgroundColor: active ? theme.colors.onPrimary : color }]} />
              <AppText
                variant="subhead"
                weight="600"
                numberOfLines={1}
                style={{ color: active ? '#FFFFFF' : theme.colors.textPrimary, maxWidth: 160 }}
              >
                {r.name}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => onEdit(r)}
              accessibilityRole="button"
              accessibilityLabel={t('editor.recipient.editTitle')}
              hitSlop={8}
              style={styles.edit}
              testID={`recipient-edit-${i}`}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={16}
                color={active ? '#FFFFFF' : theme.colors.textSecondary}
              />
            </Pressable>
          </View>
        );
      })}
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('editor.addRecipient')}
        testID="recipient-add"
        style={[
          styles.chip,
          styles.add,
          { borderRadius: theme.radius.full, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons name="add" size={18} color={theme.colors.primary} />
        <AppText variant="subhead" weight="600" color="primary">
          {t('editor.addRecipient')}
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, minHeight: MIN_TOUCH_TARGET },
  chipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: MIN_TOUCH_TARGET,
  },
  edit: { paddingHorizontal: 10, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  add: { gap: 4, paddingHorizontal: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
