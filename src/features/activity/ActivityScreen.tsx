import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, ChipGroup, EmptyState, ErrorState, LoadingSkeleton } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useTheme } from '@/theme';

import { ActivityRow } from './ActivityRow';
import { ACTIVITY_FILTERS, type ActivityFilter } from './eventMeta';
import { useActivityFeed } from './hooks';

/** Activity tab (SPEC §5.8): every event across your documents, newest first, filterable by kind. */
export function ActivityScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const feed = useActivityFeed(ACTIVITY_FILTERS[filter]);
  const items = feed.data?.pages.flat() ?? [];
  const options = (Object.keys(ACTIVITY_FILTERS) as ActivityFilter[]).map((value) => ({
    value,
    label: t(`activity.filter_${value}`),
  }));

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="activity-screen"
    >
      <FlatList
        testID="activity-list"
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
        ListHeaderComponent={
          <View
            style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm }}
          >
            <AppText variant="largeTitle" accessibilityRole="header">
              {t('activity.title')}
            </AppText>
            <ChipGroup
              options={options}
              value={filter}
              onChange={setFilter}
              accessibilityLabel={t('activity.filterLabel')}
              scroll
              testID="activity-filter"
            />
          </View>
        }
        renderItem={({ item, index }) => (
          <ActivityRow
            item={item}
            showDocument
            separator={index < items.length - 1}
            onPress={() => router.push({ pathname: '/documents/[id]', params: { id: item.documentId } })}
          />
        )}
        ListEmptyComponent={
          feed.isPending ? (
            <LoadingSkeleton rows={6} testID="activity-loading" />
          ) : feed.isError ? (
            <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} />
          ) : (
            <EmptyState
              icon="pulse-outline"
              title={t('activity.title')}
              body={filter === 'all' ? t('activity.empty') : t('activity.emptyFiltered')}
              testID="activity-empty"
            />
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View style={styles.footer} accessible accessibilityLabel={t('activity.loadMore')}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => void feed.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { paddingVertical: 16 },
});
