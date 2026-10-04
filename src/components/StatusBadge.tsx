import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { statusPresentation, useTheme, type DisplayStatus } from '@/theme';

import { AppText } from './AppText';

interface StatusBadgeProps {
  status: DisplayStatus;
  /** Icon-only (the label is still announced to screen readers). */
  compact?: boolean;
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const p = statusPresentation(status, theme.colors);
  const label = t(`status.${status}`);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        { backgroundColor: p.background, borderRadius: theme.radius.full },
        compact ? styles.compact : null,
      ]}
    >
      <Ionicons name={p.icon} size={14} color={p.foreground} />
      {compact ? null : (
        <AppText
          variant="caption"
          weight="600"
          style={{ color: p.foreground, textDecorationLine: p.strikethrough ? 'line-through' : 'none' }}
          numberOfLines={1}
        >
          {label}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  compact: { paddingHorizontal: 6 },
});
