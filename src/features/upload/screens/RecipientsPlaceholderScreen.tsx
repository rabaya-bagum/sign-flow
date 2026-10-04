import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText, EmptyState, Screen } from '@/components';

export function RecipientsPlaceholderScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen scroll edges={['bottom']}>
      <AppText variant="footnote" color="textSecondary" style={{ marginTop: 16 }}>
        {t('upload.stepRecipients')}
      </AppText>
      <EmptyState
        icon="people-outline"
        title={t('upload.recipientsPlaceholderTitle')}
        body={t('upload.recipientsPlaceholderBody')}
        tag={t('common.comingInPhase', { phase: 5 })}
        testID="placeholder"
      />
      <AppButton
        title={t('upload.continueToFields')}
        onPress={() => router.replace({ pathname: '/documents/[id]/fields', params: { id } })}
        testID="recipients-next"
      />
      <AppButton
        variant="secondary"
        title={t('upload.saveAndClose')}
        onPress={() => router.replace({ pathname: '/documents/[id]', params: { id } })}
        testID="recipients-close"
      />
    </Screen>
  );
}
