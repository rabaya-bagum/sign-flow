import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '@/lib/queryKeys';

import {
  deleteDraft,
  getDocument,
  getRecipients,
  getStorageUsage,
  listDocuments,
  listSenders,
  markOpened,
  renameDocument,
  searchDocuments,
  setHidden,
} from './api';
import type { DocumentListParams } from './types';

/** Everything that shows document data: lists, details, search, dashboard, storage usage. */
export function invalidateDocumentData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    queryClient.invalidateQueries({ queryKey: ['search'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.storageUsage() }),
  ]);
}

export function useDocumentList(params: DocumentListParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.documents.list(params),
    queryFn: ({ pageParam }) => listDocuments(params, pageParam),
    initialPageParam: null as { value: string; id: string } | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: queryKeys.documents.detail(id), queryFn: () => getDocument(id) });
}

export function useRecipients(id: string) {
  return useQuery({ queryKey: queryKeys.documents.recipients(id), queryFn: () => getRecipients(id) });
}

export function useSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: () => searchDocuments(trimmed),
    enabled: trimmed.length >= 2,
    placeholderData: (previous) => previous,
  });
}

export function useStorageUsage() {
  return useQuery({ queryKey: queryKeys.storageUsage(), queryFn: getStorageUsage });
}

export function useSenders() {
  return useQuery({ queryKey: queryKeys.documents.senders(), queryFn: listSenders, staleTime: 5 * 60_000 });
}

export function useRenameDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDocument(id, title),
    onSuccess: () => invalidateDocumentData(queryClient),
  });
}

export function useDeleteDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDraft(id),
    onSuccess: () => invalidateDocumentData(queryClient),
  });
}

export function useSetHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => setHidden(id, hidden),
    onSuccess: () => invalidateDocumentData(queryClient),
  });
}

/** Records that the user opened a document (drives "Recent documents" ordering). */
export function useMarkOpened(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    markOpened(id)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }))
      .catch((error: unknown) => console.warn('markOpened failed', error));
  }, [id, enabled, queryClient]);
}
