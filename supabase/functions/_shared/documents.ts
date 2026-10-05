import type { RequestContext } from './context.ts';
import { HttpError } from './http.ts';

export interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  original_path: string | null;
  completed_path: string | null;
  certificate_path: string | null;
  original_sha256: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  deleted_at: string | null;
}

const COLUMNS =
  'id, owner_id, title, status, original_path, completed_path, certificate_path, original_sha256, file_size_bytes, page_count, deleted_at';

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

export type DocumentFileKind = 'original' | 'completed' | 'certificate';

export function documentFilePath(
  doc: Pick<DocumentRow, 'original_path' | 'completed_path' | 'certificate_path'>,
  kind: DocumentFileKind,
): string | null {
  if (kind === 'original') return doc.original_path;
  return kind === 'completed' ? doc.completed_path : doc.certificate_path;
}

/** Safe, readable file name: the title without path/control characters, ending in .pdf. */
export function downloadFileName(title: string, kind: DocumentFileKind = 'original'): string {
  // Truncate the title before adding the suffix so a long title can't cut it off.
  const suffix = kind === 'certificate' ? ' - certificate' : '';
  const source = suffix ? title.replace(/\.pdf$/i, '') : title;
  const base =
    source
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120 - suffix.length)
      .trimEnd() || 'document';
  const named = base + suffix;
  return /\.pdf$/i.test(named) ? named : `${named}.pdf`;
}

/**
 * Appends the `download` parameter (not covered by the token) encoded exactly once: storage-js's
 * `download` option double-encodes characters such as parentheses.
 */
export function withDownloadName(signedUrl: string, fileName: string): string {
  return `${signedUrl}&download=${encodeURIComponent(fileName)}`;
}
