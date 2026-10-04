import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { useFormatRelativeTime } from '@/hooks/useRelativeTime';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import type { ActivityItem } from './api';
import { EVENT_META } from './eventMeta';

/** One audit event: icon, description, actor, document (in the global feed) and time (SPEC §5.8). */
export function ActivityRow({
  item,
  showDocument,
  onPress,
  separator,
}: {
  item: ActivityItem;
  showDocument: boolean;
  onPress?: () => void;
  separator?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const formatTime = useFormatRelativeTime();
  const meta = EVENT_META[item.type];
  const time = formatTime(item.createdAt);
  const by = item.actorName ? t('activity.by', { name: item.actorName }) : null;
  const content = (
    <View
      style={[
        styles.row,
        separator
          ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }
          : null,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.full }]}>
        <Ionicons name={meta.icon} size={18} color={theme.colors[meta.color]} />
      </View>
      <View style={styles.text}>
        <AppText variant="subhead" weight="600">
          {item.description}
        </AppText>
        {showDocument ? (
          <AppText variant="footnote" numberOfLines={1}>
            {item.documentTitle}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {[by, time].filter(Boolean).join(' · ')}
        </AppText>
      </View>
    </View>
  );
  const label = t('activity.rowLabel', {
    description: [item.description, by].filter(Boolean).join(' '),
    document: item.documentTitle,
    time,
  });
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={`activity-${item.id}`}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} testID={`activity-${item.id}`}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, minHeight: MIN_TOUCH_TARGET },
  icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
