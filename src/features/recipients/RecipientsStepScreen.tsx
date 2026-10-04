import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import type { RecipientRole } from '@shared/send';

import {
  AppButton,
  AppInput,
  AppText,
  Card,
  ChipGroup,
  ConfirmationModal,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingSkeleton,
  Screen,
} from '@/components';
import { useProfile } from '@/features/account/hooks';
import { useRecipients } from '@/features/documents/hooks';
import { fetchFields } from '@/features/editor/api';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { recipientColor, useTheme } from '@/theme';

import { saveRecipientChanges } from './api';
import {
  diffRecipients,
  isSequential,
  move,
  signingOrders,
  validateRows,
  type RecipientRow,
  type SavedRecipient,
} from './logic';

const ROLES: RecipientRole[] = ['signer', 'cc', 'approver', 'viewer'];

/** Wizard step 3 (SPEC §5.3): who signs, in which order. */
export function RecipientsStepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipients = useRecipients(id);
  if (recipients.isError)
    return <LoadErrorView error={recipients.error} onRetry={() => void recipients.refetch()} />;
  if (!recipients.data) {
    return (
      <Screen>
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  return <RecipientsForm documentId={id} saved={recipients.data as SavedRecipient[]} />;
}

function LoadErrorView({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  return (
    <Screen>
      <ErrorState message={`${t('recipients.loadError')} ${errorMessage(error)}`} onRetry={onRetry} />
    </Screen>
  );
}

const toRow = (r: SavedRecipient): RecipientRow => ({
  key: r.id,
  id: r.id,
  name: r.name,
  email: r.email ?? '',
  role: r.role,
});

function RecipientsForm({ documentId, saved }: { documentId: string; saved: SavedRecipient[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const fields = useQuery({
    queryKey: queryKeys.documents.fields(documentId),
    queryFn: () => fetchFields(documentId),
  });
  const [rows, setRows] = useState<RecipientRow[]>(() =>
    saved.length ? [...saved].sort((a, b) => a.signingOrder - b.signingOrder).map(toRow) : [newRow()],
  );
  const [sequential, setSequential] = useState(() => isSequential(saved));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState<null | (() => void)>(null);

  const errors = validateRows(rows);
  const orders = signingOrders(rows, sequential);
  const update = (key: string, patch: Partial<RecipientRow>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const me = profile.data;
  const meAdded = me ? rows.some((r) => r.email.trim().toLowerCase() === me.email.toLowerCase()) : true;

  const save = async (next: 'fields' | 'close') => {
    setSubmitted(true);
    setError(null);
    if (rows.length === 0 || Object.keys(errors).length > 0) return;
    const changes = diffRecipients(saved, rows, sequential);
    const removedWithFields = changes.remove.filter((rid) =>
      fields.data?.some((f) => f.recipient_id === rid),
    );
    const run = async () => {
      setSaving(true);
      try {
        await saveRecipientChanges(documentId, changes);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.documents.recipients(documentId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.documents.fields(documentId) }),
        ]);
        if (next === 'fields')
          router.push({ pathname: '/documents/[id]/fields', params: { id: documentId } });
        else router.replace({ pathname: '/documents/[id]', params: { id: documentId } });
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    };
    if (removedWithFields.length > 0) setConfirmRemoval(() => run);
    else await run();
  };

  const emailError = (key: string) => {
    if (!submitted) return undefined;
    const e = errors[key]?.email;
    return e === 'required'
      ? t('recipients.errorEmailRequired')
      : e === 'invalid'
        ? t('recipients.errorEmailInvalid')
        : e === 'duplicate'
          ? t('recipients.errorEmailDuplicate')
          : undefined;
  };

  return (
    <Screen scroll edges={['bottom']} testID="recipients-step">
      <AppText variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
        {t('recipients.step')}
      </AppText>
      <AppText variant="title3" accessibilityRole="header" style={{ marginVertical: theme.spacing.sm }}>
        {t('recipients.intro')}
      </AppText>

      <Card style={styles.toggle}>
        <View style={styles.flex}>
          <AppText variant="headline">{t('recipients.sequential')}</AppText>
          <AppText variant="footnote" color="textSecondary">
            {t('recipients.sequentialHint')}
          </AppText>
        </View>
        <Switch
          value={sequential}
          onValueChange={setSequential}
          accessibilityLabel={t('recipients.sequential')}
          trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
          testID="recipients-sequential"
        />
      </Card>

      {rows.map((row, index) => (
        <Card key={row.key} style={{ marginTop: theme.spacing.md }} testID={`recipient-row-${index}`}>
          <View style={styles.rowHeader}>
            <View
              style={[
                styles.badge,
                { backgroundColor: recipientColor(index), borderRadius: theme.radius.full },
              ]}
            >
              <AppText variant="caption" weight="700" style={{ color: '#FFFFFF' }}>
                {orders[index]}
              </AppText>
            </View>
            <AppText variant="subhead" weight="600" style={styles.flex} accessibilityRole="header">
              {t('recipients.rowLabel', { n: index + 1 })}
            </AppText>
            <IconButton
              icon="arrow-up"
              accessibilityLabel={t('recipients.moveUp', {
                name: row.name || t('recipients.rowLabel', { n: index + 1 }),
              })}
              onPress={() => setRows((all) => move(all, index, -1))}
              color={index === 0 ? 'textTertiary' : 'primary'}
              testID={`recipient-up-${index}`}
            />
            <IconButton
              icon="arrow-down"
              accessibilityLabel={t('recipients.moveDown', {
                name: row.name || t('recipients.rowLabel', { n: index + 1 }),
              })}
              onPress={() => setRows((all) => move(all, index, 1))}
              color={index === rows.length - 1 ? 'textTertiary' : 'primary'}
              testID={`recipient-down-${index}`}
            />
            <IconButton
              icon="trash-outline"
              accessibilityLabel={t('recipients.remove', {
                name: row.name || t('recipients.rowLabel', { n: index + 1 }),
              })}
              onPress={() => setRows((all) => all.filter((r) => r.key !== row.key))}
              color="danger"
              testID={`recipient-remove-${index}`}
            />
          </View>
          <AppInput
            label={t('recipients.name')}
            value={row.name}
            onChangeText={(name) => update(row.key, { name })}
            autoCapitalize="words"
            maxLength={120}
            error={submitted && errors[row.key]?.name ? t('recipients.errorNameRequired') : undefined}
            testID={`recipient-name-${index}`}
          />
          <AppInput
            label={t('recipients.email')}
            value={row.email}
            onChangeText={(email) => update(row.key, { email })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            error={emailError(row.key)}
            testID={`recipient-email-${index}`}
          />
          <ChipGroup
            scroll
            accessibilityLabel={t('recipients.role')}
            options={ROLES.map((role) => ({ value: role, label: t(`recipients.role_${role}`) }))}
            value={row.role}
            onChange={(role) => update(row.key, { role })}
            testID={`recipient-role-${index}`}
          />
        </Card>
      ))}

      {submitted && rows.length === 0 ? <InlineAlert tone="error" message={t('recipients.empty')} /> : null}

      <View style={[styles.adders, { marginTop: theme.spacing.md }]}>
        <AppButton
          title={t('recipients.addRecipient')}
          icon="person-add-outline"
          variant="secondary"
          onPress={() => setRows((all) => [...all, newRow()])}
          testID="recipients-add"
        />
        {!meAdded && me ? (
          <AppButton
            title={t('recipients.addMe')}
            variant="ghost"
            onPress={() => setRows((all) => [...all, { ...newRow(), name: me.full_name, email: me.email }])}
            testID="recipients-add-me"
          />
        ) : null}
      </View>

      {error ? <InlineAlert tone="error" message={error} /> : null}
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <AppButton
          title={t('recipients.next')}
          onPress={() => void save('fields')}
          loading={saving}
          fullWidth
          testID="recipients-next"
        />
        <AppButton
          title={t('recipients.saveAndClose')}
          variant="secondary"
          onPress={() => void save('close')}
          disabled={saving}
          fullWidth
          testID="recipients-close"
        />
      </View>

      <ConfirmationModal
        visible={confirmRemoval !== null}
        title={t('recipients.removeFieldsTitle')}
        message={t('recipients.removeFieldsBody')}
        confirmLabel={t('recipients.removeFieldsConfirm')}
        destructive
        onConfirm={() => {
          const run = confirmRemoval;
          setConfirmRemoval(null);
          void run?.();
        }}
        onCancel={() => setConfirmRemoval(null)}
      />
    </Screen>
  );
}

function newRow(): RecipientRow {
  return { key: Crypto.randomUUID(), name: '', email: '', role: 'signer' };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  badge: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  adders: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
