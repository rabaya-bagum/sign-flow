import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';

import { ACTIVITY_PAGE_SIZE, documentTimeline, type EventType, listActivity } from './api';

export function useActivityFeed(types: readonly EventType[] | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.activity.feed(types),
    queryFn: ({ pageParam }) => listActivity(types, pageParam),
    initialPageParam: undefined as { createdAt: string; id: number } | undefined,
    getNextPageParam: (last) => {
      const tail = last.at(-1);
      return last.length === ACTIVITY_PAGE_SIZE && tail
        ? { createdAt: tail.createdAt, id: tail.id }
        : undefined;
    },
  });
}

export function useDocumentTimeline(documentId: string) {
  return useQuery({
    queryKey: queryKeys.activity.document(documentId),
    queryFn: () => documentTimeline(documentId),
  });
}
