import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/components';
import { useFormatRelativeTime } from '@/hooks/useRelativeTime';
import { MIN_TOUCH_TARGET, statusPresentation, useTheme } from '@/theme';

import type { RecentDocument } from './api';

interface RecentDocumentRowProps {
  document: RecentDocument;
  onOpen: () => void;
  onInfo: () => void;
  separator: boolean;
}

export function RecentDocumentRow({ document, onOpen, onInfo, separator }: RecentDocumentRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const formatTime = useFormatRelativeTime();
  const p = statusPresentation(document.displayStatus, theme.colors);
  const statusLabel = t(`status.${document.displayStatus}`);
  const when = formatTime(document.updatedAt);

  return (
    <View style={[styles.row, { paddingLeft: theme.spacing.lg, paddingRight: theme.spacing.xs }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${document.title}, ${statusLabel}, ${when}`}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
        testID={`recent-${document.id}`}
      >
        <View style={[styles.icon, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Ionicons name={p.icon} size={20} color={p.foreground} />
        </View>
        <View
          style={[
            styles.text,
            separator
              ? { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
              : null,
          ]}
        >
          <AppText variant="body" weight="500" numberOfLines={1}>
            {document.title}
          </AppText>
          <AppText variant="footnote" color="textSecondary" numberOfLines={1}>
            <AppText
              variant="footnote"
              style={{ color: p.foreground, textDecorationLine: p.strikethrough ? 'line-through' : 'none' }}
            >
              {statusLabel}
            </AppText>
            {` · ${when}`}
          </AppText>
        </View>
      </Pressable>
      <IconButton
        icon="information-circle-outline"
        color="textSecondary"
        accessibilityLabel={t('home.documentDetails', { title: document.title })}
        onPress={onInfo}
        testID={`recent-info-${document.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET + 16 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, paddingVertical: 12, gap: 2 },
});
