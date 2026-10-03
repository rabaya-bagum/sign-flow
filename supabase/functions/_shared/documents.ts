import type { RequestContext } from './context.ts';
import { HttpError } from './http.ts';

export interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  original_path: string | null;
  original_sha256: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  deleted_at: string | null;
}

const COLUMNS =
  'id, owner_id, title, status, original_path, original_sha256, file_size_bytes, page_count, deleted_at';

/**
 * Loads a document the caller can see under RLS (owner or active participant). Documents the caller
 * cannot access are reported as NOT_FOUND, so their existence is not revealed.
 */
export async function loadVisibleDocument(ctx: RequestContext, documentId: string): Promise<DocumentRow> {
  const { data, error } = await ctx.asUser
    .from('documents')
    .select(COLUMNS)
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError('NOT_FOUND', 404, 'Document not found');
  return data as DocumentRow;
}

/** Like loadVisibleDocument, but only the owner passes. */
export async function loadOwnedDocument(ctx: RequestContext, documentId: string): Promise<DocumentRow> {
  const doc = await loadVisibleDocument(ctx, documentId);
  if (doc.owner_id !== ctx.userId) throw new HttpError('FORBIDDEN', 403, 'Only the owner can do this');
  return doc;
}

export function originalPath(ownerId: string, documentId: string): string {
  return `${ownerId}/${documentId}/original.pdf`;
}
