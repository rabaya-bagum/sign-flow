import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

interface EmptyStateProps {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Small label such as "Coming in Phase 2". */
  tag?: string;
  testID?: string;
}

export function EmptyState({
  icon = 'document-text-outline',
  title,
  body,
  actionLabel,
  onAction,
  tag,
  testID,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { padding: theme.spacing.xxl }]} testID={testID}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: theme.colors.primarySubtle, borderRadius: theme.radius.full },
        ]}
      >
        <Ionicons name={icon} size={32} color={theme.colors.primary} />
      </View>
      {tag ? (
        <View
          style={[styles.tag, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.full }]}
        >
          <AppText variant="caption" color="textSecondary" weight="600">
            {tag}
          </AppText>
        </View>
      ) : null}
      <AppText variant="title3" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText variant="callout" color="textSecondary" align="center">
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton title={actionLabel} onPress={onAction} fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  iconWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 4 },
  action: { marginTop: 8 },
});
