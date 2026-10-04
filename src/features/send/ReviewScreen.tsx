import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { DEFAULT_EXPIRY_DAYS, validateForSend, type SendIssue, type SendRecipient } from '@shared/send';

import {
  AppButton,
  AppInput,
  AppText,
  Card,
  Checkbox,
  ChipGroup,
  ErrorState,
  InlineAlert,
  ListRow,
  LoadingSkeleton,
  Screen,
} from '@/components';
import { useProfile } from '@/features/account/hooks';
import { invalidateDocumentData, useDocument, useRecipients } from '@/features/documents/hooks';
import { fetchFields } from '@/features/editor/api';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { recipientColor, useTheme } from '@/theme';

import { fetchSendSettings, saveSendSettings, sendDocument, type SendSettings } from './api';

const EXPIRY_CHOICES = [7, 14, 30, 60, 90] as const;
const REMINDER_CHOICES = [0, 1, 2, 3, 7] as const;

/** Wizard step 5 (SPEC §5.3): email, expiry, reminders, options; Send is blocked until complete. */
export function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const document = useDocument(id);
  const recipients = useRecipients(id);
  const fields = useQuery({ queryKey: queryKeys.documents.fields(id), queryFn: () => fetchFields(id) });
  const settings = useQuery({
    queryKey: ['documents', 'send-settings', id],
    queryFn: () => fetchSendSettings(id),
    gcTime: 0,
  });
  const profile = useProfile();
  const failure = document.error ?? recipients.error ?? fields.error ?? settings.error;
  if (failure) {
    return (
      <Screen>
        <ErrorState
          message={`${t('review.loadError')} ${errorMessage(failure)}`}
          onRetry={() => void settings.refetch()}
        />
      </Screen>
    );
  }
  if (!document.data || !recipients.data || !fields.data || !settings.data || !profile.data) {
    return (
      <Screen>
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  return (
    <ReviewForm
      documentId={id}
      title={document.data.title}
      hasFile={!document.data.uploadIncomplete && Boolean(document.data.pageCount)}
      recipients={recipients.data as SendRecipient[]}
      fieldCounts={Object.fromEntries(
        recipients.data.map((r) => [r.id, fields.data.filter((f) => f.recipient_id === r.id).length]),
      )}
      issues={validateForSend({
        hasFile: Boolean(document.data.pageCount),
        recipients: recipients.data as SendRecipient[],
        fields: fields.data,
      })}
      saved={settings.data}
      defaults={{
        expiryDays: profile.data.default_expiry_days,
        reminder: profile.data.default_reminder as { repeat_every_days?: number },
      }}
    />
  );
}

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - now) / 86_400_000);
}

function ReviewForm(props: {
  documentId: string;
  title: string;
  hasFile: boolean;
  recipients: SendRecipient[];
  fieldCounts: Record<string, number>;
  issues: SendIssue[];
  saved: SendSettings;
  defaults: { expiryDays: number; reminder: { repeat_every_days?: number } };
}) {
  const { documentId, title, recipients, fieldCounts, issues, saved, defaults } = props;
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(saved.email_subject ?? t('review.subjectDefault', { title }));
  const [message, setMessage] = useState(saved.email_message ?? '');
  // Expiry is relative to when the screen opened (kept stable across renders).
  const [now] = useState(() => Date.now());
  const savedDays = daysUntil(saved.expires_at, now);
  const initialDays =
    EXPIRY_CHOICES.find((d) => d === savedDays) ??
    EXPIRY_CHOICES.find((d) => d === defaults.expiryDays) ??
    DEFAULT_EXPIRY_DAYS;
  const [expiryDays, setExpiryDays] = useState<number>(initialDays);
  const initialReminder = saved.reminder_repeat_every_days ?? defaults.reminder.repeat_every_days ?? 0;
  const [reminder, setReminder] = useState<number>(
    REMINDER_CHOICES.includes(initialReminder as never) ? initialReminder : 3,
  );
  const [requireOtp, setRequireOtp] = useState(saved.require_email_otp);
  const [allowDecline, setAllowDecline] = useState(saved.allow_decline);
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expiresAt = new Date(now + expiryDays * 86_400_000);
  const settings = (): SendSettings => ({
    email_subject: subject.trim() || null,
    email_message: message.trim() || null,
    expires_at: expiresAt.toISOString(),
    reminder_first_after_days: reminder || null,
    reminder_repeat_every_days: reminder || null,
    require_email_otp: requireOtp,
    allow_decline: allowDecline,
  });
  const nameOf = (rid: string) => recipients.find((r) => r.id === rid)?.name ?? '';
  const issueText = (issue: SendIssue) =>
    t(`review.issue_${issue.code}`, { name: 'recipientId' in issue ? nameOf(issue.recipientId) : '' });

  const run = async (action: 'save' | 'send') => {
    setBusy(action);
    setError(null);
    try {
      if (action === 'save') {
        await saveSendSettings(documentId, settings());
      } else {
        const result = await sendDocument(documentId, settings());
        invalidateDocumentData(queryClient);
        Alert.alert(
          t('review.sentTitle'),
          [
            t('review.sentBody', { count: result.notified }),
            result.failed.length ? t('review.sentPartial') : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        );
      }
      router.replace({ pathname: '/documents/[id]', params: { id: documentId } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll edges={['bottom']} testID="review-screen">
      <Stack.Screen options={{ title: t('review.title') }} />
      <AppText variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
        {t('review.step')}
      </AppText>

      <AppText variant="headline" style={styles.section} accessibilityRole="header">
        {t('review.summary')}
      </AppText>
      <Card padded={false}>
        {recipients.map((r, i) => (
          <ListRow
            key={r.id}
            left={<View style={[styles.dot, { backgroundColor: recipientColor(i) }]} />}
            title={r.name}
            subtitle={[
              r.email ?? '—',
              t('review.recipientLine', {
                role: t(`recipients.role_${r.role}`),
                order: r.signingOrder,
                fields: t('review.fields', { count: fieldCounts[r.id] ?? 0 }),
              }),
            ].join('\n')}
            separator={i < recipients.length - 1}
          />
        ))}
      </Card>

      {issues.length > 0 ? (
        <Card
          style={{ ...styles.section, borderColor: theme.colors.warning, borderWidth: 1 }}
          testID="review-issues"
        >
          <AppText variant="headline" accessibilityRole="header">
            {t('review.issuesTitle')}
          </AppText>
          {issues.map((issue, i) => (
            <AppText key={i} variant="callout" style={{ marginTop: 6 }}>
              {`• ${issueText(issue)}`}
            </AppText>
          ))}
          <View style={[styles.row, { marginTop: theme.spacing.md }]}>
            <AppButton
              title={t('review.editRecipients')}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/documents/new/recipients', params: { id: documentId } })
              }
              testID="review-edit-recipients"
            />
            <AppButton
              title={t('review.editFields')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/documents/[id]/fields', params: { id: documentId } })}
              testID="review-edit-fields"
            />
          </View>
        </Card>
      ) : null}

      <View style={styles.section}>
        <AppInput
          label={t('review.subject')}
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
          testID="review-subject"
        />
        <AppInput
          label={t('review.message')}
          value={message}
          onChangeText={setMessage}
          maxLength={2000}
          multiline
          testID="review-message"
        />
      </View>

      <AppText variant="subhead" color="textSecondary">
        {t('review.expires')}
      </AppText>
      <ChipGroup
        accessibilityLabel={t('review.expires')}
        options={EXPIRY_CHOICES.map((d) => ({
          value: String(d),
          label: t('review.expiresDays', { count: d }),
        }))}
        value={String(expiryDays)}
        onChange={(v) => setExpiryDays(Number(v))}
        testID="review-expiry"
      />
      <AppText variant="footnote" color="textSecondary" style={{ marginTop: 4 }}>
        {t('review.expiresOn', { date: expiresAt.toLocaleDateString(undefined, { dateStyle: 'medium' }) })}
      </AppText>

      <AppText variant="subhead" color="textSecondary" style={styles.section}>
        {t('review.reminders')}
      </AppText>
      <ChipGroup
        scroll
        accessibilityLabel={t('review.reminders')}
        options={REMINDER_CHOICES.map((d) => ({
          value: String(d),
          label: d === 0 ? t('review.remindersOff') : t('review.remindersEvery', { count: d }),
        }))}
        value={String(reminder)}
        onChange={(v) => setReminder(Number(v))}
        testID="review-reminders"
      />
      <AppText variant="footnote" color="textSecondary" style={{ marginTop: 4 }}>
        {t('review.remindersHint')}
      </AppText>

      <View style={[styles.section, { gap: theme.spacing.xs }]}>
        <Checkbox
          checked={allowDecline}
          onChange={setAllowDecline}
          accessibilityLabel={t('review.allowDecline')}
          testID="review-allow-decline"
        >
          <AppText>{t('review.allowDecline')}</AppText>
        </Checkbox>
        <Checkbox
          checked={requireOtp}
          onChange={setRequireOtp}
          accessibilityLabel={t('review.requireOtp')}
          testID="review-require-otp"
        >
          <AppText>{t('review.requireOtp')}</AppText>
          <AppText variant="footnote" color="textSecondary">
            {t('review.requireOtpHint')}
          </AppText>
        </Checkbox>
      </View>

      {error ? <InlineAlert tone="error" message={error} testID="review-error" /> : null}
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <AppButton
          title={t('review.send')}
          icon="paper-plane-outline"
          onPress={() => void run('send')}
          disabled={issues.length > 0 || busy !== null}
          loading={busy === 'send'}
          fullWidth
          testID="review-send"
        />
        <AppButton
          title={t('review.saveDraft')}
          variant="secondary"
          onPress={() => void run('save')}
          disabled={busy !== null}
          loading={busy === 'save'}
          fullWidth
          testID="review-save"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
