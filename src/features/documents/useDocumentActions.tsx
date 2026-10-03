import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ActionSheet, ConfirmationModal, type SheetAction } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';

import { availableActions, type ActionTarget, type DocumentActionKey } from './actions';
import { canSaveToDevice, saveToDevice, shareDocument } from './download';
import { useDeleteDraft, useSetHidden } from './hooks';
import { RenameModal } from './RenameModal';

/**
 * Document action menu + the confirmations and rename dialog it can open. Render `elements` once;
 * call `show(doc)` from a card's ⋯ button. `run(key, doc)` triggers an action directly (details screen).
 */
export function useDocumentActions({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const deleteDraft = useDeleteDraft();
  const setHidden = useSetHidden();
  const [menuFor, setMenuFor] = useState<ActionTarget | null>(null);
  const [renaming, setRenaming] = useState<ActionTarget | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'hide'; doc: ActionTarget } | null>(null);

  const fail = (error: unknown) => Alert.alert(t('errors.title'), errorMessage(error));

  const run = (key: DocumentActionKey, doc: ActionTarget) => {
    switch (key) {
      case 'open':
        router.push({ pathname: '/documents/[id]', params: { id: doc.id } });
        return;
      case 'retryUpload':
        router.push({ pathname: '/documents/new/source', params: { documentId: doc.id } });
        return;
      case 'rename':
        setRenaming(doc);
        return;
      case 'share':
        shareDocument(doc.id).catch(fail);
        return;
      case 'saveToDevice':
        saveToDevice(doc.id)
          .then((saved) => saved && Alert.alert(t('documents.saved')))
          .catch(fail);
        return;
      case 'delete':
      case 'hide':
        setConfirm({ kind: key, doc });
        return;
      case 'unhide':
        setHidden.mutate({ id: doc.id, hidden: false }, { onError: fail });
        return;
    }
  };

  const ICONS: Record<DocumentActionKey, SheetAction['icon']> = {
    open: 'open-outline',
    retryUpload: 'cloud-upload-outline',
    rename: 'pencil-outline',
    share: 'share-outline',
    saveToDevice: 'download-outline',
    delete: 'trash-outline',
    hide: 'eye-off-outline',
    unhide: 'eye-outline',
  };
  const LABELS: Record<DocumentActionKey, string> = {
    open: t('common.open'),
    retryUpload: t('documents.retryUpload'),
    rename: t('common.rename'),
    share: t('common.share'),
    saveToDevice: t('documents.saveToDevice'),
    delete: t('common.delete'),
    hide: t('documents.removeFromLibrary'),
    unhide: t('documents.restoreToLibrary'),
  };

  const sheetActions: SheetAction[] = menuFor
    ? availableActions(menuFor, { canSave: canSaveToDevice }).map((key) => ({
        key,
        label: LABELS[key],
        icon: ICONS[key],
        hint: key === 'hide' ? t('documents.removeFromLibraryHint') : undefined,
        destructive: key === 'delete',
        onPress: () => run(key, menuFor),
      }))
    : [];

  const confirmAction = () => {
    if (!confirm) return;
    const { kind, doc } = confirm;
    const done = { onSettled: () => setConfirm(null), onError: fail };
    if (kind === 'delete') deleteDraft.mutate(doc.id, { ...done, onSuccess: () => onDeleted?.() });
    else setHidden.mutate({ id: doc.id, hidden: true }, done);
  };

  const elements: ReactNode = (
    <>
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.title ?? t('documents.actionsTitle')}
        actions={sheetActions}
        onClose={() => setMenuFor(null)}
        closeLabel={t('common.close')}
        testID="document-actions"
      />
      <RenameModal key={renaming?.id ?? 'none'} document={renaming} onClose={() => setRenaming(null)} />
      <ConfirmationModal
        visible={confirm !== null}
        title={confirm?.kind === 'delete' ? t('documents.deleteDraftTitle') : t('documents.removeTitle')}
        message={confirm?.kind === 'delete' ? t('documents.deleteDraftBody') : t('documents.removeBody')}
        confirmLabel={confirm?.kind === 'delete' ? t('common.delete') : t('common.remove')}
        destructive
        loading={deleteDraft.isPending || setHidden.isPending}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
        testID="document-confirm"
      />
    </>
  );

  return { show: setMenuFor, run, elements };
}
