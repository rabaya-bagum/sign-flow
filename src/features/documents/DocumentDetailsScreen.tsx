import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { isAppError } from '@shared/errors';

import {
  ActionSheet,
  AppButton,
  AppText,
  Card,
  EmptyState,
  ErrorState,
  InlineAlert,
  ListRow,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatusBadge,
} from '@/components';
import { DocumentTimeline } from '@/features/activity/DocumentTimeline';
import { useCurrentUserId } from '@/features/auth/store';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { useTheme } from '@/theme';
import { formatBytes } from '@/utils/formatBytes';

import { availableActions, type ActionTarget } from './actions';
import { remindRecipients, voidDocument } from './api';
import { DocumentPreviewCard } from './DocumentPreviewCard';
import { canSaveToDevice, shareDocument } from './download';
import { useDocument, useMarkOpened, useRecipients } from './hooks';
import type { Recipient } from './types';
import { useDocumentActions } from './useDocumentActions';
import { VoidSheet } from './VoidSheet';

function useFormatDate() {
  const { i18n } = useTranslation();
  return (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function RecipientRow({
  recipient,
  isYou,
  separator,
  onPress,
}: {
  recipient: Recipient;
  isYou: boolean;
  separator: boolean;
  /** Owner of a document in progress: opens the recipient's actions (Remind). */
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const name = isYou ? t('details.you', { name: recipient.name }) : recipient.name;
  const role = t(`details.role_${recipient.role}`);
  const status = t(`details.rstatus_${recipient.status}`);
  return (
    <ListRow
      title={name}
      subtitle={[
        recipient.email,
        `${role} · ${t('details.order', { order: recipient.signingOrder })}`,
        recipient.lastActionAt ? formatDate(recipient.lastActionAt) : null,
      ]
        .filter(Boolean)
        .join('\n')}
      value={status}
      separator={separator}
      onPress={onPress}
      chevron={Boolean(onPress)}
      accessibilityHint={onPress ? t('lifecycle.remindHint') : undefined}
      testID={`recipient-${recipient.id}`}
    />
  );
}

export function DocumentDetailsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const formatDate = useFormatDate();
  const userId = useCurrentUserId();
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);
  const recipients = useRecipients(id);
  useMarkOpened(id, document.isSuccess);
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{ kind: 'void' } | { kind: 'recipient'; recipient: Recipient } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.activity.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
  const runRemind = async (recipientId?: string) => {
    setSheet(null);
    setLifecycleError(null);
    setNotice(null);
    try {
      const result = await remindRecipients(id, recipientId);
      setNotice(
        [
          result.reminded === 1
            ? t('lifecycle.reminded')
            : t('lifecycle.remindedMany', { count: result.reminded }),
          result.skipped.length ? t('lifecycle.remindSkipped') : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      await refreshAll();
    } catch (e) {
      setLifecycleError(errorMessage(e));
    }
  };
  const runVoid = async (reason: string) => {
    setBusy(true);
    setLifecycleError(null);
    try {
      await voidDocument(id, reason);
      setSheet(null);
      setNotice(t('lifecycle.voided'));
      await refreshAll();
    } catch (e) {
      setLifecycleError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const actions = useDocumentActions({
    onDeleted: () => (router.canGoBack() ? router.back() : router.replace('/documents')),
  });

  const downloadKind = async (kind: 'completed' | 'certificate') => {
    try {
      await shareDocument(id, kind);
    } catch (e) {
      Alert.alert(t('errors.title'), errorMessage(e));
    }
  };

  if (document.isPending) return <LoadingSkeleton rows={4} testID="details-loading" />;
  if (document.isError) {
    return isAppError(document.error) &&
      (document.error.code === 'NOT_FOUND' || document.error.code === 'FORBIDDEN') ? (
      <EmptyState
        icon="document-outline"
        title={t('details.title')}
        body={t('details.notFound')}
        testID="details-not-found"
      />
    ) : (
      <ErrorState message={errorMessage(document.error)} onRetry={() => void document.refetch()} />
    );
  }

  const doc = document.data;
  const target: ActionTarget = {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    displayStatus: doc.displayStatus,
    isOwner: doc.isOwner,
    uploadIncomplete: doc.uploadIncomplete,
    hidden: doc.hidden,
  };
  const keys = availableActions(target, { includeOpen: false, canSave: canSaveToDevice });
  const isDraftOwner = doc.status === 'draft' && doc.isOwner;
  const canManage = doc.isOwner && doc.status === 'in_progress';
  const remindable = (r: Recipient) =>
    canManage && r.role !== 'cc' && (r.status === 'sent' || r.status === 'viewed');
  // The caller's own turn to sign or approve (SPEC §6.3 "Needs your signature").
  const myTurn =
    doc.status === 'in_progress'
      ? recipients.data?.find(
          (r) =>
            r.userId !== null &&
            r.userId === userId &&
            (r.role === 'signer' || r.role === 'approver') &&
            (r.status === 'sent' || r.status === 'viewed'),
        )
      : undefined;

  return (
    <Screen
      scroll
      edges={['bottom']}
      refreshControl={
        <RefreshControl
          refreshing={document.isRefetching}
          onRefresh={() => void Promise.all([document.refetch(), recipients.refetch()])}
          tintColor={theme.colors.primary}
        />
      }
      testID="details-screen"
    >
      <Stack.Screen options={{ title: doc.title }} />
      <AppText variant="title2" accessibilityRole="header" style={styles.title} testID="details-heading">
        {doc.title}
      </AppText>

      <Card style={styles.banner} testID="details-banner">
        <StatusBadge status={doc.displayStatus} />
        <AppText variant="callout">{t(`details.banner_${doc.displayStatus}`)}</AppText>
        {doc.status === 'voided' && doc.voidReason ? (
          <AppText variant="footnote" color="textSecondary">
            {t('details.voidedBanner', { reason: doc.voidReason })}
          </AppText>
        ) : null}
      </Card>
      {notice ? <InlineAlert tone="success" message={notice} testID="details-notice" /> : null}
      {lifecycleError && !sheet ? <InlineAlert message={lifecycleError} testID="details-error" /> : null}

      {doc.hidden ? <InlineAlert tone="info" message={t('details.hiddenNotice')} /> : null}
      {doc.uploadIncomplete ? (
        <InlineAlert tone="info" message={t('details.uploadIncompleteNotice')} />
      ) : null}

      {!doc.uploadIncomplete && doc.pageCount ? (
        <DocumentPreviewCard documentId={doc.id} title={doc.title} />
      ) : null}

      <SectionHeader title={t('details.info')} />
      <Card padded={false}>
        <ListRow title={t('details.pages')} value={doc.pageCount ? String(doc.pageCount) : '—'} separator />
        <ListRow title={t('details.size')} value={formatBytes(doc.fileSizeBytes)} separator />
        <ListRow title={t('details.created')} value={formatDate(doc.createdAt)} separator />
        <ListRow title={t('details.updated')} value={formatDate(doc.updatedAt)} separator />
        <ListRow
          title={t('details.sender')}
          value={doc.isOwner ? t('details.you', { name: doc.ownerName ?? '' }) : (doc.ownerName ?? '—')}
        />
      </Card>

      <SectionHeader title={t('details.recipients')} />
      <Card padded={false}>
        {recipients.isPending ? (
          <LoadingSkeleton rows={2} />
        ) : recipients.isError ? (
          <ErrorState message={errorMessage(recipients.error)} onRetry={() => void recipients.refetch()} />
        ) : recipients.data.length === 0 ? (
          <AppText variant="subhead" color="textSecondary" style={styles.empty}>
            {t('details.noRecipients')}
          </AppText>
        ) : (
          recipients.data.map((r, i) => (
            <RecipientRow
              key={r.id}
              recipient={r}
              isYou={r.userId !== null && r.userId === userId}
              separator={i < recipients.data.length - 1}
              onPress={remindable(r) ? () => setSheet({ kind: 'recipient', recipient: r }) : undefined}
            />
          ))
        )}
      </Card>

      <SectionHeader title={t('details.actions')} />
      <View style={styles.actions}>
        {myTurn ? (
          <AppButton
            title={myTurn.role === 'approver' ? t('details.approveNow') : t('details.signNow')}
            icon="create-outline"
            onPress={() => router.push({ pathname: '/documents/[id]/sign', params: { id: doc.id } })}
            testID="details-sign"
          />
        ) : null}
        {canManage && recipients.data?.some(remindable) ? (
          <AppButton
            title={t('lifecycle.remindAll')}
            icon="alarm-outline"
            variant="secondary"
            accessibilityHint={t('lifecycle.remindHint')}
            onPress={() => void runRemind()}
            testID="details-remind-all"
          />
        ) : null}
        {doc.status === 'completed' ? (
          <>
            <AppButton
              title={t('details.downloadSigned')}
              icon="download-outline"
              onPress={() => void downloadKind('completed')}
              testID="details-download-signed"
            />
            <AppButton
              title={t('details.downloadCertificate')}
              icon="ribbon-outline"
              variant="secondary"
              onPress={() => void downloadKind('certificate')}
              testID="details-download-certificate"
            />
          </>
        ) : null}
        {isDraftOwner && !doc.uploadIncomplete ? (
          <>
            <AppButton
              title={t('details.reviewAndSend')}
              icon="paper-plane-outline"
              onPress={() => router.push({ pathname: '/documents/[id]/review', params: { id: doc.id } })}
              testID="details-review"
            />
            <AppButton
              title={t('details.editRecipients')}
              icon="people-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/documents/new/recipients', params: { id: doc.id } })}
              testID="details-edit-recipients"
            />
            <AppButton
              title={t('details.continueEditing')}
              icon="create-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/documents/[id]/fields', params: { id: doc.id } })}
              testID="details-edit-fields"
            />
          </>
        ) : null}
        {keys.includes('retryUpload') ? (
          <AppButton
            title={t('documents.retryUpload')}
            icon="cloud-upload-outline"
            onPress={() => actions.run('retryUpload', target)}
            testID="details-retry"
          />
        ) : null}
        {keys.includes('share') ? (
          <AppButton
            title={t('common.share')}
            icon="share-outline"
            variant="secondary"
            onPress={() => actions.run('share', target)}
            testID="details-share"
          />
        ) : null}
        {keys.includes('saveToDevice') ? (
          <AppButton
            title={t('documents.saveToDevice')}
            icon="download-outline"
            variant="secondary"
            onPress={() => actions.run('saveToDevice', target)}
          />
        ) : null}
        {keys.includes('rename') ? (
          <AppButton
            title={t('common.rename')}
            icon="pencil-outline"
            variant="secondary"
            onPress={() => actions.run('rename', target)}
            testID="details-rename"
          />
        ) : null}
        {keys.includes('unhide') ? (
          <AppButton
            title={t('documents.restoreToLibrary')}
            icon="eye-outline"
            variant="secondary"
            onPress={() => actions.run('unhide', target)}
            testID="details-unhide"
          />
        ) : null}
        {keys.includes('hide') ? (
          <AppButton
            title={t('documents.removeFromLibrary')}
            icon="eye-off-outline"
            variant="destructive"
            accessibilityHint={t('documents.removeFromLibraryHint')}
            onPress={() => actions.run('hide', target)}
            testID="details-hide"
          />
        ) : null}
        {canManage ? (
          <AppButton
            title={t('lifecycle.void')}
            icon="ban-outline"
            variant="destructive"
            onPress={() => {
              setLifecycleError(null);
              setSheet({ kind: 'void' });
            }}
            testID="details-void"
          />
        ) : null}
        {keys.includes('delete') ? (
          <AppButton
            title={t('common.delete')}
            icon="trash-outline"
            variant="destructive"
            onPress={() => actions.run('delete', target)}
            testID="details-delete"
          />
        ) : null}
      </View>
      {doc.status !== 'draft' ? (
        <>
          <SectionHeader title={t('activity.timeline')} />
          <DocumentTimeline documentId={doc.id} />
        </>
      ) : null}
      {actions.elements}
      <VoidSheet
        visible={sheet?.kind === 'void'}
        busy={busy}
        error={sheet?.kind === 'void' ? lifecycleError : null}
        onConfirm={(reason) => void runVoid(reason)}
        onClose={() => setSheet(null)}
      />
      <ActionSheet
        visible={sheet?.kind === 'recipient'}
        title={
          sheet?.kind === 'recipient' ? t('lifecycle.recipientActions', { name: sheet.recipient.name }) : ''
        }
        actions={
          sheet?.kind === 'recipient'
            ? [
                {
                  key: 'remind',
                  label: t('lifecycle.remindOne', { name: sheet.recipient.name }),
                  hint: t('lifecycle.remindHint'),
                  icon: 'alarm-outline',
                  onPress: () => void runRemind(sheet.recipient.id),
                },
              ]
            : []
        }
        onClose={() => setSheet(null)}
        closeLabel={t('common.close')}
        testID="recipient-actions"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 12, marginBottom: 12 },
  banner: { gap: 8, marginBottom: 16 },
  empty: { padding: 16 },
  actions: { gap: 10 },
});
