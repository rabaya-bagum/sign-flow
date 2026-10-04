import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, ChipGroup, ErrorState, InlineAlert, LoadingSkeleton, Screen } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { useProfile, useUpdateSigningDefaults } from './hooks';

const EXPIRY_CHOICES = ['7', '14', '30', '60', '90'] as const;
const REMINDER_CHOICES = ['0', '1', '2', '3', '7'] as const;

/** Account → Default signing settings (SPEC §5.10): expiry and reminders for new documents. */
export function DefaultSigningScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const profile = useProfile();
  const update = useUpdateSigningDefaults();

  if (profile.isPending) return <LoadingSkeleton rows={4} />;
  if (profile.isError)
    return <ErrorState message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} />;
  const expiry = String(profile.data.default_expiry_days);
  const repeat = (profile.data.default_reminder as { repeat_every_days?: number | null } | null)
    ?.repeat_every_days;
  const reminder = String(repeat ?? 0);

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={{ paddingTop: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="default-signing"
    >
      <AppText color="textSecondary">{t('defaultSigning.intro')}</AppText>
      {update.isError ? <InlineAlert message={errorMessage(update.error)} /> : null}
      <View style={styles.section}>
        <AppText weight="600">{t('defaultSigning.expiry')}</AppText>
        <ChipGroup
          options={EXPIRY_CHOICES.map((d) => ({
            value: d,
            label: t('review.expiresDays', { count: Number(d) }),
          }))}
          value={
            (EXPIRY_CHOICES as readonly string[]).includes(expiry)
              ? (expiry as (typeof EXPIRY_CHOICES)[number])
              : '30'
          }
          onChange={(d) => update.mutate({ expiryDays: Number(d), reminderDays: Number(reminder) || null })}
          accessibilityLabel={t('defaultSigning.expiry')}
          testID="default-expiry"
        />
      </View>
      <View style={styles.section}>
        <AppText weight="600">{t('defaultSigning.reminders')}</AppText>
        <ChipGroup
          options={REMINDER_CHOICES.map((d) => ({
            value: d,
            label: d === '0' ? t('review.remindersOff') : t('review.remindersEvery', { count: Number(d) }),
          }))}
          value={
            (REMINDER_CHOICES as readonly string[]).includes(reminder)
              ? (reminder as (typeof REMINDER_CHOICES)[number])
              : '0'
          }
          onChange={(d) => update.mutate({ expiryDays: Number(expiry), reminderDays: Number(d) || null })}
          accessibilityLabel={t('defaultSigning.reminders')}
          testID="default-reminders"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { gap: 8 } });
