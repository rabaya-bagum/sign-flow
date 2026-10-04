import { AppError } from '@shared/errors';
import { MAX_TITLE_LENGTH } from '@shared/limits';

import { toAppError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { isDisplayStatus, type DisplayStatus } from '@/theme';

import { toRpcFilters } from './filters';
import type {
  DocumentDetail,
  DocumentListParams,
  DocumentPage,
  Participant,
  Recipient,
  SearchResult,
} from './types';

export const PAGE_SIZE = 20;

function displayStatus(value: string): DisplayStatus {
  return isDisplayStatus(value) ? value : 'draft';
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('FORBIDDEN');
  return id;
}

/** Default title from a file name: no extension, trimmed, within the title limit. */
export function titleFromFileName(name: string, fallback: string): string {
  const base = name
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (base || fallback).slice(0, MAX_TITLE_LENGTH);
}

export async function createDraft(title: string): Promise<string> {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from('documents')
    .insert({ owner_id: ownerId, title })
    .select('id')
    .single();
  if (error) throw toAppError(error);
  return data.id;
}

export interface ProcessUploadResult {
  document_id: string;
  page_count: number;
  file_size_bytes: number;
  original_sha256: string;
}

export function processUpload(documentId: string, imagePaths?: string[]): Promise<ProcessUploadResult> {
  return invokeFunction('process-upload', {
    document_id: documentId,
    ...(imagePaths ? { image_paths: imagePaths } : {}),
  });
}

export function getDownloadUrl(
  documentId: string,
): Promise<{ url: string; expires_in: number; file_name: string }> {
  return invokeFunction('get-download-url', {
    document_id: documentId,
    kind: 'original',
    purpose: 'download',
  });
}

/** Signed URL for the in-app viewer: inline, logs DOCUMENT_VIEWED (de-duplicated server-side). */
export function getViewUrl(
  documentId: string,
): Promise<{ url: string; expires_in: number; file_name: string }> {
  return invokeFunction('get-download-url', { document_id: documentId, kind: 'original', purpose: 'view' });
}

export function deleteDraft(documentId: string): Promise<{ document_id: string; deleted: boolean }> {
  return invokeFunction('delete-draft', { document_id: documentId });
}

export async function renameDocument(documentId: string, title: string): Promise<void> {
  const { data, error } = await supabase
    .from('documents')
    .update({ title })
    .eq('id', documentId)
    .select('id');
  if (error) throw toAppError(error);
  // RLS only allows renaming your own drafts; zero rows means the action is not available.
  if (!data.length) throw new AppError('INVALID_STATE');
}

async function upsertUserState(
  documentId: string,
  patch: { hidden_at?: string | null; last_opened_at?: string },
) {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('document_user_state')
    .upsert({ document_id: documentId, user_id: userId, ...patch }, { onConflict: 'document_id,user_id' });
  if (error) throw toAppError(error);
}

/** "Remove from my library" (SPEC §6.2) — hides the document for this user only. */
export function setHidden(documentId: string, hidden: boolean): Promise<void> {
  return upsertUserState(documentId, { hidden_at: hidden ? new Date().toISOString() : null });
}

export function markOpened(documentId: string): Promise<void> {
  return upsertUserState(documentId, { last_opened_at: new Date().toISOString() });
}

export async function listDocuments(
  params: DocumentListParams,
  cursor: { value: string; id: string } | null,
): Promise<DocumentPage> {
  const { data, error } = await supabase.rpc('list_documents', {
    p_bucket: params.bucket,
    p_search: params.search.trim() || undefined,
    p_sort: params.sort,
    p_filters: toRpcFilters(params.filters),
    p_cursor_value: cursor?.value,
    p_cursor_id: cursor?.id,
    p_limit: PAGE_SIZE,
  });
  if (error) throw toAppError(error);
  const items = data.map((row) => ({
    id: row.id,
    title: row.title,
    displayStatus: displayStatus(row.display_status),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileSizeBytes: row.file_size_bytes,
    pageCount: row.page_count,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    participants: (row.participants as unknown as Participant[] | null) ?? [],
    participantCount: row.participant_count,
    signersTotal: row.signers_total,
    signersCompleted: row.signers_completed,
    uploadIncomplete: row.upload_incomplete,
    cursorValue: row.cursor_value,
  }));
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: items.length === PAGE_SIZE && last ? { value: last.cursorValue, id: last.id } : null,
  };
}

export async function getDocument(documentId: string): Promise<DocumentDetail> {
  const { data, error } = await supabase.rpc('get_document', { p_document_id: documentId }).maybeSingle();
  if (error) throw toAppError(error);
  if (!data) throw new AppError('NOT_FOUND');
  return {
    id: data.id,
    title: data.title,
    displayStatus: displayStatus(data.display_status),
    status: data.status,
    ownerId: data.owner_id,
    ownerName: data.owner_name,
    isOwner: data.is_owner,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    sentAt: data.sent_at,
    completedAt: data.completed_at,
    voidedAt: data.voided_at,
    voidReason: data.void_reason,
    fileSizeBytes: data.file_size_bytes,
    pageCount: data.page_count,
    uploadIncomplete: data.upload_incomplete,
    hidden: data.hidden,
  };
}

export async function getRecipients(documentId: string): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from('document_recipients')
    .select(
      'id, name, email, role, signing_order, status, user_id, sent_at, viewed_at, completed_at, declined_at',
    )
    .eq('document_id', documentId)
    .order('signing_order')
    .order('created_at');
  if (error) throw toAppError(error);
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    signingOrder: r.signing_order,
    status: r.status,
    userId: r.user_id,
    lastActionAt: r.declined_at ?? r.completed_at ?? r.viewed_at ?? r.sent_at,
  }));
}

export async function searchDocuments(query: string): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_documents', { p_query: query });
  if (error) throw toAppError(error);
  return data.map((r) => ({
    id: r.id,
    title: r.title,
    displayStatus: displayStatus(r.display_status),
    updatedAt: r.updated_at,
    matchedRecipientName: r.matched_recipient_name,
    matchedRecipientEmail: r.matched_recipient_email,
  }));
}

export async function getStorageUsage(): Promise<{ bytes: number; documentCount: number }> {
  const { data, error } = await supabase.rpc('get_storage_usage').single();
  if (error) throw toAppError(error);
  return { bytes: Number(data.bytes), documentCount: data.document_count };
}

export async function listSenders(): Promise<{ id: string; fullName: string }[]> {
  const { data, error } = await supabase.rpc('list_document_senders');
  if (error) throw toAppError(error);
  return data.map((s) => ({ id: s.id, fullName: s.full_name }));
}
