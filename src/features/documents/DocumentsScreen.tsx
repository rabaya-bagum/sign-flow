import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  ChipGroup,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingSkeleton,
  SearchField,
} from '@/components';
import { useCurrentUserId } from '@/features/auth/store';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { DocumentCard } from './DocumentCard';
import { FilterSheet } from './FilterSheet';
import { useDocumentList } from './hooks';
import { SortSheet, useSortLabel } from './SortSheet';
import {
  countActiveFilters,
  EMPTY_FILTERS,
  LIBRARY_BUCKETS,
  type DocumentFilters,
  type DocumentSort,
  type LibraryBucket,
} from './types';
import { useDocumentActions } from './useDocumentActions';

function isLibraryBucket(value: unknown): value is LibraryBucket {
  return typeof value === 'string' && (LIBRARY_BUCKETS as readonly string[]).includes(value);
}

function ToolbarButton({
  icon,
  label,
  onPress,
  badge,
  testID,
}: {
  icon: 'swap-vertical' | 'options-outline';
  label: string;
  onPress: () => void;
  badge?: number;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.toolbarButton,
        { backgroundColor: pressed ? theme.colors.surface : 'transparent', borderRadius: theme.radius.md },
      ]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.primary} />
      <AppText variant="subhead" color="primary" weight="600">
        {label}
      </AppText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <AppText variant="caption" weight="700" style={{ color: theme.colors.onPrimary }}>
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function DocumentsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const sortLabel = useSortLabel();
  const params = useLocalSearchParams<{ bucket?: string }>();
  const userId = useCurrentUserId();

  const [bucket, setBucket] = useState<LibraryBucket>(isLibraryBucket(params.bucket) ? params.bucket : 'all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DocumentSort>('newest');
  const [filters, setFilters] = useState<DocumentFilters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  // Home's summary rows open this tab with ?bucket=…; follow it when it changes (derived state).
  const [followedParam, setFollowedParam] = useState(params.bucket);
  if (params.bucket !== followedParam) {
    setFollowedParam(params.bucket);
    if (isLibraryBucket(params.bucket)) setBucket(params.bucket);
  }

  const query = useDocumentList({ bucket, search: debouncedSearch, sort, filters });
  const actions = useDocumentActions();
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const activeFilters = countActiveFilters(filters);

  const bucketOptions = [
    { value: 'all' as const, label: t('documents.bucketAll') },
    { value: 'needs_signature' as const, label: t('documents.bucketNeedsSignature') },
    { value: 'waiting' as const, label: t('documents.bucketWaiting') },
    { value: 'draft' as const, label: t('documents.bucketDraft') },
    { value: 'completed' as const, label: t('documents.bucketCompleted') },
    { value: 'closed' as const, label: t('documents.bucketClosed') },
  ];

  const header = (
    <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <View style={styles.titleRow}>
        <AppText variant="largeTitle" accessibilityRole="header" style={styles.title}>
          {t('documents.title')}
        </AppText>
        <IconButton
          icon="add-circle-outline"
          accessibilityLabel={t('home.newDocument')}
          onPress={() => router.push('/documents/new/source')}
          testID="documents-new"
        />
      </View>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={t('documents.searchPlaceholder')}
        accessibilityLabel={t('documents.searchLabel')}
        clearLabel={t('common.clear')}
        testID="documents-search"
      />
      <ChipGroup
        options={bucketOptions}
        value={bucket}
        onChange={setBucket}
        accessibilityLabel={t('documents.filter')}
        scroll
        testID="bucket"
      />
      <View style={styles.toolbar}>
        <ToolbarButton
          icon="swap-vertical"
          label={sortLabel(sort)}
          onPress={() => setSheet('sort')}
          testID="documents-sort"
        />
        <ToolbarButton
          icon="options-outline"
          label={
            activeFilters ? t('documents.filterWithCount', { count: activeFilters }) : t('documents.filter')
          }
          badge={activeFilters || undefined}
          onPress={() => setSheet('filter')}
          testID="documents-filter"
        />
      </View>
    </View>
  );

  const emptyMessage =
    debouncedSearch.trim() || activeFilters ? t('documents.emptySearch') : t(`documents.empty_${bucket}`);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="documents-screen"
    >
      <FlatList
        testID="documents-list"
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.md,
        }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <DocumentCard
            document={item}
            onOpen={() => router.push({ pathname: '/documents/[id]', params: { id: item.id } })}
            onMore={() =>
              actions.show({
                id: item.id,
                title: item.title,
                status: item.status,
                displayStatus: item.displayStatus,
                isOwner: item.ownerId === userId,
                uploadIncomplete: item.uploadIncomplete,
                hidden: false,
              })
            }
          />
        )}
        ListEmptyComponent={
          query.isPending ? (
            <LoadingSkeleton rows={4} testID="documents-loading" />
          ) : query.isError ? (
            <ErrorState
              message={`${t('documents.loadError')} ${errorMessage(query.error)}`}
              onRetry={() => void query.refetch()}
              testID="documents-error"
            />
          ) : (
            <EmptyState
              icon="folder-open-outline"
              title={t('documents.emptyTitle')}
              body={emptyMessage}
              testID="documents-empty"
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footer} accessibilityLabel={t('documents.loadMore')} accessible>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      <SortSheet visible={sheet === 'sort'} value={sort} onChange={setSort} onClose={() => setSheet(null)} />
      <FilterSheet
        visible={sheet === 'filter'}
        value={filters}
        onApply={setFilters}
        onClose={() => setSheet(null)}
      />
      {actions.elements}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between' },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 8,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  footer: { paddingVertical: 16 },
});
