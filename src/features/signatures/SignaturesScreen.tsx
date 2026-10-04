import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  ActionSheet,
  AppButton,
  AppText,
  ConfirmationModal,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonBlock,
} from '@/components';
import { useProfile } from '@/features/account/hooks';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { useDeleteSignature, useSavedSignatures, useSetDefaultSignature } from './hooks';
import { SignatureImage } from './SignatureImage';
import { SignatureSheet } from './SignatureSheet';
import { MAX_SAVED_PER_KIND, type SavedSignature, type SignatureKind } from './types';

const KINDS: SignatureKind[] = ['signature', 'initials'];

/** Account → Signatures (SPEC §5.10): list, add, set default, delete. */
export function SignaturesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const saved = useSavedSignatures();
  const profile = useProfile();
  const setDefault = useSetDefaultSignature();
  const remove = useDeleteSignature();
  const [adding, setAdding] = useState<SignatureKind | null>(null);
  const [menuFor, setMenuFor] = useState<SavedSignature | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedSignature | null>(null);

  const rows = saved.data ?? [];
  const fail = (e: unknown) => Alert.alert(t('errors.title'), errorMessage(e));

  if (saved.isPending) {
    return (
      <Screen scroll edges={['bottom']}>
        <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
          <SkeletonBlock height={72} />
          <SkeletonBlock height={72} />
        </View>
      </Screen>
    );
  }
  if (saved.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message={`${t('signatures.loadError')} ${errorMessage(saved.error)}`}
          onRetry={() => void saved.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']} testID="signatures-screen">
      {rows.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title={t('signatures.emptyTitle')}
          body={t('signatures.empty')}
          actionLabel={t('signatures.addSignature')}
          onAction={() => setAdding('signature')}
          testID="signatures-empty"
        />
      ) : null}

      {KINDS.map((kind) => {
        const items = rows.filter((r) => r.kind === kind);
        if (rows.length === 0 && kind === 'signature') return null;
        const full = items.length >= MAX_SAVED_PER_KIND;
        return (
          <View key={kind} style={[styles.section, { marginTop: theme.spacing.lg }]}>
            <AppText variant="footnote" color="textSecondary" weight="600" accessibilityRole="header">
              {t(
                kind === 'signature' ? 'signatures.sectionSignatures' : 'signatures.sectionInitials',
              ).toUpperCase()}
            </AppText>
            {items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setMenuFor(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  t('signatures.savedItemLabel', {
                    method: t(`signatures.method_${item.method}`),
                    kind: t(`signatures.kind_${item.kind}`),
                    date: new Date(item.created_at).toLocaleDateString(),
                  }) + (item.is_default ? `, ${t('signatures.savedItemDefault')}` : '')
                }
                accessibilityHint={t('signatures.itemHint')}
                testID={`signature-item-${item.id}`}
                style={[
                  styles.item,
                  {
                    borderRadius: theme.radius.md,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <SignatureImage
                  path={item.storage_path}
                  height={kind === 'initials' ? 56 : 64}
                  style={styles.flex}
                />
                {item.is_default ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.colors.primarySubtle, borderRadius: theme.radius.full },
                    ]}
                  >
                    <AppText variant="caption" color="primary" weight="600">
                      {t('signatures.savedItemDefault')}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            ))}
            <AppButton
              title={
                full
                  ? t('signatures.atLimit')
                  : t(kind === 'signature' ? 'signatures.addSignature' : 'signatures.addInitials')
              }
              icon={full ? undefined : 'add'}
              variant="secondary"
              disabled={full}
              onPress={() => setAdding(kind)}
              testID={`signatures-add-${kind}`}
            />
          </View>
        );
      })}

      <SignatureSheet
        visible={adding !== null}
        kind={adding ?? 'signature'}
        defaultName={profile.data?.full_name ?? ''}
        onComplete={() => setAdding(null)}
        onClose={() => setAdding(null)}
      />
      <ActionSheet
        visible={menuFor !== null}
        title={t('signatures.itemActions')}
        closeLabel={t('signatures.close')}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                ...(menuFor.is_default
                  ? []
                  : [
                      {
                        key: 'default',
                        label: t('signatures.setDefault'),
                        icon: 'star-outline' as const,
                        onPress: () => {
                          setDefault.mutate(menuFor, { onError: fail });
                          setMenuFor(null);
                        },
                      },
                    ]),
                {
                  key: 'delete',
                  label: t('signatures.delete'),
                  icon: 'trash-outline' as const,
                  destructive: true,
                  onPress: () => {
                    setConfirmDelete(menuFor);
                    setMenuFor(null);
                  },
                },
              ]
            : []
        }
        testID="signature-actions"
      />
      <ConfirmationModal
        visible={confirmDelete !== null}
        title={t('signatures.deleteConfirmTitle', {
          kind: t(`signatures.kind_${confirmDelete?.kind ?? 'signature'}`),
        })}
        message={t('signatures.deleteConfirmBody')}
        confirmLabel={t('signatures.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          confirmDelete &&
          remove.mutate(confirmDelete, { onSettled: () => setConfirmDelete(null), onError: fail })
        }
        onCancel={() => setConfirmDelete(null)}
        testID="signature-delete-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4 },
  flex: { flex: 1 },
});
