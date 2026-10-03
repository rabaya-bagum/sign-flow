import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { isAppError } from '@shared/errors';

import {
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
import { useCurrentUserId } from '@/features/auth/store';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';
import { formatBytes } from '@/utils/formatBytes';

import { availableActions, type ActionTarget } from './actions';
import { canSaveToDevice } from './download';
import { useDocument, useMarkOpened, useRecipients } from './hooks';
import type { Recipient } from './types';
import { useDocumentActions } from './useDocumentActions';

function useFormatDate() {
  const { i18n } = useTranslation();
  return (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function RecipientRow({
  recipient,
  isYou,
  separator,
}: {
  recipient: Recipient;
  isYou: boolean;
  separator: boolean;
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
  const actions = useDocumentActions({
    onDeleted: () => (router.canGoBack() ? router.back() : router.replace('/documents')),
  });

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
      </Card>

      {doc.hidden ? <InlineAlert tone="info" message={t('details.hiddenNotice')} /> : null}
      {doc.uploadIncomplete ? (
        <InlineAlert tone="info" message={t('details.uploadIncompleteNotice')} />
      ) : null}

      {!doc.uploadIncomplete ? (
        <Card style={styles.placeholder}>
          <AppText variant="headline">{t('details.preview')}</AppText>
          <AppText variant="footnote" color="textSecondary">
            {t('details.previewPlaceholder')}
          </AppText>
          <AppText variant="caption" color="textTertiary" weight="600">
            {t('common.comingInPhase', { phase: 3 })}
          </AppText>
        </Card>
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
            />
          ))
        )}
      </Card>

      <SectionHeader title={t('details.actions')} />
      <View style={styles.actions}>
        {isDraftOwner && !doc.uploadIncomplete ? (
          <AppButton
            title={t('details.continueEditing')}
            variant="secondary"
            disabled
            accessibilityHint={t('details.continueEditingPlaceholder')}
          />
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
      {actions.elements}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 12, marginBottom: 12 },
  banner: { gap: 8, marginBottom: 16 },
  placeholder: { gap: 4 },
  empty: { padding: 16 },
  actions: { gap: 10 },
});
