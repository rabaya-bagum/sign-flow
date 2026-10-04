import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, View } from 'react-native';

import { documentTitleFormSchema, type DocumentTitleValues } from '@shared/documents';

import { AppButton, AppText, ControlledInput, InlineAlert } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { useRenameDocument } from './hooks';

interface RenameModalProps {
  document: { id: string; title: string } | null;
  onClose: () => void;
}

export function RenameModal({ document, onClose }: RenameModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const rename = useRenameDocument();
  const [error, setError] = useState<string | null>(null);
  // The parent keys this component by document id, so local error state starts fresh per document.
  const { control, handleSubmit, reset, formState } = useForm<DocumentTitleValues>({
    resolver: zodResolver(documentTitleFormSchema),
    defaultValues: { title: '' },
  });

  useEffect(() => {
    if (document) reset({ title: document.title });
  }, [document, reset]);

  const submit = handleSubmit(async ({ title }) => {
    if (!document) return;
    setError(null);
    try {
      if (title !== document.title) await rename.mutateAsync({ id: document.id, title });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Modal
      visible={document !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.xl },
          ]}
          testID="rename-modal"
        >
          <AppText variant="title3" accessibilityRole="header" style={styles.title}>
            {t('documents.renameTitle')}
          </AppText>
          {error ? <InlineAlert message={error} /> : null}
          <ControlledInput
            control={control}
            name="title"
            label={t('upload.title')}
            maxLength={200}
            autoFocus
            testID="rename-input"
          />
          <AppButton
            title={t('common.save')}
            onPress={() => void submit()}
            loading={formState.isSubmitting}
            testID="rename-save"
          />
          <AppButton
            title={t('common.cancel')}
            variant="ghost"
            onPress={onClose}
            disabled={formState.isSubmitting}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { padding: 24, gap: 8, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { marginBottom: 8 },
});
