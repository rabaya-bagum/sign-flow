import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, ErrorState, LoadingSkeleton, TextLink } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { ActivityRow } from './ActivityRow';
import { useDocumentTimeline } from './hooks';

const COLLAPSED = 5;

/** Per-document audit timeline on the details screen (SPEC §5.4, §12). */
export function DocumentTimeline({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const timeline = useDocumentTimeline(documentId);
  const [expanded, setExpanded] = useState(false);

  if (timeline.isPending) return <LoadingSkeleton rows={2} />;
  if (timeline.isError)
    return <ErrorState message={errorMessage(timeline.error)} onRetry={() => void timeline.refetch()} />;
  const items = timeline.data;
  const shown = expanded ? items : items.slice(0, COLLAPSED);
  return (
    <Card testID="details-timeline">
      {items.length === 0 ? (
        <AppText color="textSecondary">{t('activity.timelineEmpty')}</AppText>
      ) : (
        <View>
          {shown.map((item, i) => (
            <ActivityRow key={item.id} item={item} showDocument={false} separator={i < shown.length - 1} />
          ))}
        </View>
      )}
      {items.length > COLLAPSED ? (
        <View style={{ paddingTop: theme.spacing.sm }}>
          <TextLink
            title={expanded ? t('activity.showLess') : t('activity.showAll', { count: items.length })}
            onPress={() => setExpanded((e) => !e)}
            testID="details-timeline-toggle"
          />
        </View>
      ) : null}
    </Card>
  );
}
