import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { documentTitleFormSchema, type DocumentTitleValues } from '@shared/documents';

import {
  AppButton,
  AppText,
  ControlledInput,
  ErrorState,
  InlineAlert,
  LoadingSkeleton,
  Screen,
} from '@/components';
import { useDocument, useRenameDocument } from '@/features/documents/hooks';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { formatBytes } from '@/utils/formatBytes';

export function DetailsStepScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);
  const rename = useRenameDocument();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset, formState } = useForm<DocumentTitleValues>({
    resolver: zodResolver(documentTitleFormSchema),
    defaultValues: { title: '' },
  });

  useEffect(() => {
    if (document.data) reset({ title: document.data.title });
  }, [document.data, reset]);

  const save = (next: 'recipients' | 'close') =>
    handleSubmit(async ({ title }) => {
      setError(null);
      try {
        if (title !== document.data?.title) await rename.mutateAsync({ id, title });
        if (next === 'recipients') router.push({ pathname: '/documents/new/recipients', params: { id } });
        else router.replace({ pathname: '/documents/[id]', params: { id } });
      } catch (e) {
        setError(errorMessage(e));
      }
    })();

  if (document.isPending) return <LoadingSkeleton rows={2} />;
  if (document.isError)
    return <ErrorState message={errorMessage(document.error)} onRetry={() => void document.refetch()} />;

  return (
    <Screen scroll edges={['bottom']}>
      <AppText variant="footnote" color="textSecondary" style={styles.step}>
        {t('upload.stepDetails')}
      </AppText>
      <AppText variant="title2" accessibilityRole="header" style={styles.heading}>
        {t('upload.detailsTitle')}
      </AppText>
      {error ? <InlineAlert message={error} /> : null}
      <ControlledInput
        control={control}
        name="title"
        label={t('upload.title')}
        maxLength={200}
        testID="details-title"
      />
      <AppText variant="subhead" color="textSecondary" style={styles.meta} testID="details-meta">
        {t('upload.pagesAndSize', {
          pages: document.data.pageCount ?? 0,
          size: formatBytes(document.data.fileSizeBytes),
        })}
      </AppText>
      <AppButton
        title={t('upload.continue')}
        onPress={() => void save('recipients')}
        loading={formState.isSubmitting}
        testID="details-continue"
      />
      <AppButton
        title={t('upload.saveAndClose')}
        variant="ghost"
        onPress={() => void save('close')}
        disabled={formState.isSubmitting}
        testID="details-close"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { marginTop: 16, marginBottom: 4 },
  heading: { marginBottom: 20 },
  meta: { marginTop: -4, marginBottom: 24 },
});
