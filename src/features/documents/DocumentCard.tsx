import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, IconButton, StatusBadge } from '@/components';
import { useFormatRelativeTime } from '@/hooks/useRelativeTime';
import { statusPresentation, useTheme } from '@/theme';
import { formatBytes } from '@/utils/formatBytes';

import { ParticipantStack } from './ParticipantStack';
import type { DocumentListItem } from './types';

interface DocumentCardProps {
  document: DocumentListItem;
  onOpen: () => void;
  onMore: () => void;
}

export function DocumentCard({ document, onOpen, onMore }: DocumentCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const formatTime = useFormatRelativeTime();
  const p = statusPresentation(document.displayStatus, theme.colors);
  const updated = t('documents.updated', { when: formatTime(document.updatedAt) });
  const meta = [updated, document.fileSizeBytes ? formatBytes(document.fileSizeBytes) : null]
    .filter(Boolean)
    .join(' · ');
  const progress =
    document.signersTotal > 0
      ? t('documents.progress', { done: document.signersCompleted, total: document.signersTotal })
      : null;

  return (
    <View
      style={[
        styles.card,
        theme.cardElevation,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
      ]}
      testID={`doc-card-${document.id}`}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={[document.title, t(`status.${document.displayStatus}`), progress, meta]
          .filter(Boolean)
          .join(', ')}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.icon, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Ionicons name={p.icon} size={22} color={p.foreground} />
        </View>
        <View style={styles.body}>
          <AppText variant="headline" numberOfLines={2}>
            {document.title}
          </AppText>
          <AppText variant="footnote" color="textSecondary" numberOfLines={1}>
            {meta}
          </AppText>
          <View style={styles.badges}>
            <StatusBadge status={document.displayStatus} />
            {progress ? (
              <AppText variant="footnote" color="textSecondary">
                {progress}
              </AppText>
            ) : null}
          </View>
          {document.uploadIncomplete ? (
            <View style={styles.warning}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
              <AppText variant="footnote" color="warning" weight="600">
                {t('documents.uploadIncomplete')}
              </AppText>
            </View>
          ) : null}
          <ParticipantStack participants={document.participants} total={document.participantCount} />
        </View>
      </Pressable>
      <IconButton
        icon="ellipsis-horizontal"
        color="textSecondary"
        accessibilityLabel={t('documents.moreActions', { title: document.title })}
        onPress={onMore}
        testID={`doc-more-${document.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    paddingRight: 4,
  },
  main: { flex: 1, flexDirection: 'row', gap: 12 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 6 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
