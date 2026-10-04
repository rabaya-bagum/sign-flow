import { useTranslation } from 'react-i18next';

import { Card, ListRow, SkeletonBlock } from '@/components';
import { useTheme, type ColorToken } from '@/theme';

import type { DashboardSummary } from './api';
import { BUCKET_LABEL_KEYS, DASHBOARD_BUCKETS, type DashboardBucket } from './buckets';

const COUNT_FIELD = {
  needs_signature: 'needsSignature',
  waiting: 'waiting',
  draft: 'drafts',
  completed: 'completed',
} as const satisfies Record<DashboardBucket, keyof DashboardSummary>;

const ICONS = {
  needs_signature: { icon: 'create-outline', color: 'warning' },
  waiting: { icon: 'time-outline', color: 'primary' },
  draft: { icon: 'pencil-outline', color: 'textSecondary' },
  completed: { icon: 'checkmark-circle-outline', color: 'success' },
} as const satisfies Record<DashboardBucket, { icon: string; color: ColorToken }>;

interface SummaryCardProps {
  summary: DashboardSummary | undefined;
  loading: boolean;
  onSelect: (bucket: DashboardBucket) => void;
}

export function SummaryCard({ summary, loading, onSelect }: SummaryCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Card padded={false} testID="summary-card">
      {DASHBOARD_BUCKETS.map((bucket, i) => {
        const label = t(BUCKET_LABEL_KEYS[bucket]);
        const count = summary?.[COUNT_FIELD[bucket]];
        return (
          <ListRow
            key={bucket}
            title={label}
            icon={ICONS[bucket].icon}
            iconColor={ICONS[bucket].color}
            value={count === undefined ? undefined : String(count)}
            right={loading ? <SkeletonBlock width={24} height={16} radius={theme.radius.sm} /> : undefined}
            onPress={() => onSelect(bucket)}
            separator={i < DASHBOARD_BUCKETS.length - 1}
            accessibilityLabel={count === undefined ? label : t('home.summaryRowLabel', { label, count })}
            testID={`summary-${bucket}`}
          />
        );
      })}
    </Card>
  );
}
