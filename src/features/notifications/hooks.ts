import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationPrefs } from '@shared/notifications';

import { useCurrentUserId } from '@/features/auth/store';
import { queryKeys } from '@/lib/queryKeys';

import {
  fetchNotificationPrefs,
  INBOX_PAGE_SIZE,
  listNotifications,
  markRead,
  saveNotificationPrefs,
  unreadCount,
} from './api';

export function useInbox() {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: ({ pageParam }) => listNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === INBOX_PAGE_SIZE ? last.at(-1)?.createdAt : undefined),
  });
}

/** Unread count for the bell's dot; refreshed every minute and on focus. */
export function useUnreadCount() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: unreadCount,
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => markRead(ids),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

export function useNotificationPrefs() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: queryKeys.notifications.prefs(userId ?? ''),
    queryFn: () => fetchNotificationPrefs(userId!),
    enabled: Boolean(userId),
  });
}

export function useSaveNotificationPrefs() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPrefs) => saveNotificationPrefs(userId!, prefs),
    onMutate: async (prefs) => {
      const key = queryKeys.notifications.prefs(userId ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPrefs>(key);
      queryClient.setQueryData(key, prefs);
      return { previous, key };
    },
    onError: (_e, _prefs, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
  });
}
