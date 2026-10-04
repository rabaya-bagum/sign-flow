import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { NOTIFICATION_TOPICS, type NotificationPrefs, type NotificationTopic } from '@shared/notifications';

import {
  AppButton,
  AppText,
  Card,
  ErrorState,
  InlineAlert,
  LoadingSkeleton,
  Screen,
  SwitchRow,
} from '@/components';
import { useNotificationPrefs, useSaveNotificationPrefs } from '@/features/notifications/hooks';
import { enablePush, pushStatus, type PushStatus } from '@/features/notifications/push';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

/** Account → Notifications (SPEC §5.10, §13): channels (email, push) and topics. */
export function NotificationPrefsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const prefs = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const [device, setDevice] = useState<PushStatus | null>(null);

  useEffect(() => {
    void pushStatus().then(setDevice);
  }, []);

  if (prefs.isPending) return <LoadingSkeleton rows={6} />;
  if (prefs.isError)
    return <ErrorState message={errorMessage(prefs.error)} onRetry={() => void prefs.refetch()} />;
  const value = prefs.data;
  const update = (next: NotificationPrefs) => save.mutate(next);

  const setPush = async (on: boolean) => {
    if (on && device !== 'granted') setDevice(await enablePush(true).catch(() => 'denied' as const));
    update({ ...value, push: on });
  };
  const setTopic = (topic: NotificationTopic, on: boolean) =>
    update({ ...value, topics: { ...value.topics, [topic]: on } });

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={{ paddingTop: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="notification-prefs"
    >
      {save.isError ? <InlineAlert message={errorMessage(save.error)} /> : null}
      <View style={styles.section}>
        <AppText
          variant="footnote"
          color="textSecondary"
          weight="600"
          accessibilityRole="header"
          style={styles.header}
        >
          {t('notificationPrefs.channels').toUpperCase()}
        </AppText>
        <Card padded={false}>
          <SwitchRow
            title={t('notificationPrefs.email')}
            subtitle={t('notificationPrefs.emailHint')}
            value={value.email}
            onValueChange={(on) => update({ ...value, email: on })}
            separator
            testID="prefs-email"
          />
          <SwitchRow
            title={t('notificationPrefs.push')}
            subtitle={t('notificationPrefs.pushHint')}
            value={value.push && device !== 'unavailable'}
            disabled={device === 'unavailable'}
            onValueChange={(on) => void setPush(on)}
            testID="prefs-push"
          />
        </Card>
        {device === 'unavailable' && Platform.OS !== 'web' ? (
          <AppText variant="footnote" color="textSecondary" style={styles.header}>
            {t('notificationPrefs.pushUnavailable')}
          </AppText>
        ) : null}
        {device === 'denied' && value.push ? (
          <View style={{ gap: theme.spacing.sm }}>
            <InlineAlert tone="info" message={t('notificationPrefs.pushDenied')} />
            <AppButton
              title={t('notificationPrefs.openSettings')}
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <AppText
          variant="footnote"
          color="textSecondary"
          weight="600"
          accessibilityRole="header"
          style={styles.header}
        >
          {t('notificationPrefs.topics').toUpperCase()}
        </AppText>
        <Card padded={false}>
          {NOTIFICATION_TOPICS.map((topic, i) => (
            <SwitchRow
              key={topic}
              title={t(`notificationPrefs.topic_${topic}`)}
              subtitle={t(`notificationPrefs.topic_${topic}Hint`)}
              value={value.topics[topic]}
              onValueChange={(on) => setTopic(topic, on)}
              separator={i < NOTIFICATION_TOPICS.length - 1}
              testID={`prefs-topic-${topic}`}
            />
          ))}
        </Card>
        <AppText variant="footnote" color="textSecondary" style={styles.header}>
          {t('notificationPrefs.inAppNote')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  header: { marginHorizontal: 16 },
});
