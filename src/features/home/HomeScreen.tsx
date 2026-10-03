import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingSkeleton,
  Screen,
  SectionHeader,
} from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import type { DashboardBucket } from './buckets';
import { useDashboardSummary, useRecentDocuments } from './hooks';
import { RecentDocumentRow } from './RecentDocumentRow';
import { SummaryCard } from './SummaryCard';

export function HomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const summary = useDashboardSummary();
  const recent = useRecentDocuments();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([summary.refetch(), recent.refetch()]);
    setRefreshing(false);
  }, [summary, recent]);

  const openBucket = (bucket: DashboardBucket) =>
    router.navigate({ pathname: '/documents', params: { bucket } });
  const openDetails = (id: string, title: string) =>
    router.push({ pathname: '/documents/[id]', params: { id, title } });
  const openUpload = () => router.push('/documents/new');

  const failed = summary.isError && recent.isError;

  return (
    <Screen
      scroll
      edges={['top']}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={theme.colors.primary}
        />
      }
      testID="home-screen"
    >
      <View style={styles.header}>
        <AppText variant="largeTitle" accessibilityRole="header" style={styles.title}>
          {t('home.title')}
        </AppText>
        <IconButton
          icon="search-outline"
          accessibilityLabel={t('home.search')}
          onPress={() => router.push('/search')}
        />
        <IconButton
          icon="add-circle-outline"
          accessibilityLabel={t('home.newDocument')}
          onPress={openUpload}
        />
        <IconButton
          icon="notifications-outline"
          accessibilityLabel={t('home.notifications')}
          onPress={() => router.push('/notifications')}
        />
      </View>

      {failed ? (
        <ErrorState
          message={`${t('home.loadError')} ${errorMessage(summary.error)}`}
          onRetry={() => void onRefresh()}
          testID="home-error"
        />
      ) : (
        <>
          <AppText variant="subhead" color="textSecondary" weight="600" style={styles.caption}>
            {t('home.summaryTitle')}
          </AppText>
          <SummaryCard summary={summary.data} loading={summary.isPending} onSelect={openBucket} />

          <SectionHeader title={t('home.recentTitle')} />
          <Card padded={false}>
            {recent.isPending ? (
              <LoadingSkeleton rows={3} testID="recent-loading" />
            ) : recent.isError ? (
              <ErrorState message={errorMessage(recent.error)} onRetry={() => void recent.refetch()} />
            ) : recent.data.length === 0 ? (
              <EmptyState title={t('home.emptyTitle')} body={t('home.emptyBody')} testID="recent-empty" />
            ) : (
              recent.data.map((doc, i) => (
                <RecentDocumentRow
                  key={doc.id}
                  document={doc}
                  separator={i < recent.data.length - 1}
                  onOpen={() => openDetails(doc.id, doc.title)}
                  onInfo={() => openDetails(doc.id, doc.title)}
                />
              ))
            )}
          </Card>
        </>
      )}

      <AppButton
        title={t('home.uploadDocument')}
        icon="cloud-upload-outline"
        onPress={openUpload}
        style={styles.cta}
        testID="home-upload"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 16 },
  title: { flex: 1 },
  caption: { marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  cta: { marginTop: 24 },
});
