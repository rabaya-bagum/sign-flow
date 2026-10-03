import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';

import { fetchDashboardSummary, fetchRecentDocuments } from './api';

export const RECENT_DOCUMENTS_LIMIT = 5;

export function useDashboardSummary() {
  return useQuery({ queryKey: queryKeys.dashboard.summary(), queryFn: fetchDashboardSummary });
}

export function useRecentDocuments() {
  return useQuery({
    queryKey: queryKeys.dashboard.recent(RECENT_DOCUMENTS_LIMIT),
    queryFn: () => fetchRecentDocuments(RECENT_DOCUMENTS_LIMIT),
  });
}
