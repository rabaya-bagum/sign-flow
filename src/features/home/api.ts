import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isDisplayStatus, type DisplayStatus } from '@/theme';

export interface DashboardSummary {
  needsSignature: number;
  waiting: number;
  drafts: number;
  completed: number;
}

export interface RecentDocument {
  id: string;
  title: string;
  displayStatus: DisplayStatus;
  updatedAt: string;
  ownerName: string | null;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('get_dashboard_summary').single();
  if (error) throw toAppError(error);
  return {
    needsSignature: Number(data.needs_signature),
    waiting: Number(data.waiting),
    drafts: Number(data.drafts),
    completed: Number(data.completed),
  };
}

export async function fetchRecentDocuments(limit: number): Promise<RecentDocument[]> {
  const { data, error } = await supabase.rpc('list_recent_documents', { p_limit: limit });
  if (error) throw toAppError(error);
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    // Unknown statuses would mean the client is older than the database; show them as drafts
    // rather than crashing, and warn so it surfaces in development.
    displayStatus: isDisplayStatus(row.display_status)
      ? row.display_status
      : (console.warn('Unknown display_status', row.display_status), 'draft'),
    updatedAt: row.updated_at,
    ownerName: row.owner_name,
  }));
}
