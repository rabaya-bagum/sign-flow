import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, LoadingSkeleton, TextLink } from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { useFormatRelativeTime } from '@/hooks/useRelativeTime';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import type { InboxItem } from './api';
import { useInbox, useMarkRead } from './hooks';

/** In-app inbox (SPEC §13): newest first; opening one marks it read and opens its document. */
export function InboxScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const formatTime = useFormatRelativeTime();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = inbox.data?.pages.flat() ?? [];
  const hasUnread = items.some((i) => !i.readAt);

  const open = (item: InboxItem) => {
    if (!item.readAt) markRead.mutate([item.id]);
    if (item.documentId) router.push({ pathname: '/documents/[id]', params: { id: item.documentId } });
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]} testID="inbox-screen">
      <Stack.Screen
        options={{
          headerRight: () =>
            hasUnread ? (
              <TextLink
                title={t('inbox.markAllRead')}
                onPress={() => markRead.mutate(undefined)}
                testID="inbox-mark-all"
              />
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
        renderItem={({ item, index }) => {
          const time = formatTime(item.createdAt);
          const unread = !item.readAt;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                t('inbox.itemLabel', { title: item.title, body: item.body, time }) +
                (unread ? `, ${t('inbox.itemUnread')}` : '')
              }
              onPress={() => open(item)}
              style={[
                styles.row,
                index < items.length - 1
                  ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }
                  : null,
              ]}
              testID={`inbox-item-${index}`}
            >
              <View
                style={[styles.dot, { backgroundColor: unread ? theme.colors.primary : 'transparent' }]}
                importantForAccessibility="no"
              />
              <View style={styles.text}>
                <AppText variant="subhead" weight={unread ? '700' : '400'}>
                  {item.title}
                </AppText>
                <AppText variant="footnote" color="textSecondary" numberOfLines={2}>
                  {item.body}
                </AppText>
              </View>
              <AppText variant="caption" color="textTertiary">
                {time}
              </AppText>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          inbox.isPending ? (
            <LoadingSkeleton rows={5} />
          ) : inbox.isError ? (
            <ErrorState message={errorMessage(inbox.error)} onRetry={() => void inbox.refetch()} />
          ) : (
            <EmptyState
              icon="notifications-outline"
              title={t('inbox.title')}
              body={t('inbox.empty')}
              testID="inbox-empty"
            />
          )
        }
        ListFooterComponent={inbox.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null}
        onEndReached={() => {
          if (inbox.hasNextPage && !inbox.isFetchingNextPage) void inbox.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
            onRefresh={() => void inbox.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  text: { flex: 1, gap: 2 },
  footer: { paddingVertical: 16 },
});
