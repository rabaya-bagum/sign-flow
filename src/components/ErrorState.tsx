import { useTranslation } from 'react-i18next';

import { EmptyState } from './EmptyState';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  testID?: string;
}

export function ErrorState({ message, onRetry, testID }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={t('errors.title')}
      body={message}
      actionLabel={onRetry ? t('common.retry') : undefined}
      onAction={onRetry}
      testID={testID}
    />
  );
}
