import { SIGNED_URL_TTL_SECONDS } from '../../../shared/limits.ts';
import type { RequestContext } from '../_shared/context.ts';
import { z } from '../_shared/deps.ts';
import {
  documentFilePath,
  downloadFileName,
  loadVisibleDocument,
  withDownloadName,
} from '../_shared/documents.ts';
import { logDocumentView, logEvent } from '../_shared/events.ts';
import { HttpError } from '../_shared/http.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

export const GetDownloadUrlInput = z.object({
  document_id: z.uuid(),
  kind: z.enum(['original', 'completed', 'certificate']).default('original'),
  /** `view` opens in the in-app viewer (inline, DOCUMENT_VIEWED de-duplicated); `download` saves/shares. */
  purpose: z.enum(['view', 'download']).default('download'),
});

export interface GetDownloadUrlResult {
  url: string;
  expires_in: number;
  file_name: string;
}

/**
 * Authorizes the caller (owner or active participant, via RLS), logs DOCUMENT_VIEWED (purpose `view`,
 * de-duplicated) or DOCUMENT_DOWNLOADED, and returns a short-lived signed URL (SPEC §9, §10).
 */
export async function getDownloadUrl(
  input: z.output<typeof GetDownloadUrlInput>,
  ctx: RequestContext,
): Promise<GetDownloadUrlResult> {
  const doc = await loadVisibleDocument(ctx, input.document_id);
  const path = documentFilePath(doc, input.kind);
  if (input.kind !== 'original' && doc.status !== 'completed') {
    throw new HttpError('INVALID_STATE', 409, 'Completed copies are available after all parties sign');
  }
  if (!path) throw new HttpError('INVALID_STATE', 409, 'This document has no file yet');

  await enforceRateLimit(ctx.admin, `${input.purpose}:${ctx.userId}`, 60, 60);

  const fileName = downloadFileName(doc.title, input.kind);
  const { data, error } = await ctx.admin.storage
    .from('documents')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw error ?? new Error('Could not sign URL');

  if (input.purpose === 'view') {
    // Viewing is audited but never changes recipient status (SPEC §10).
    await logDocumentView(ctx, doc.id);
    return { url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS, file_name: fileName };
  }

  await logEvent(ctx, doc.id, 'DOCUMENT_DOWNLOADED', 'Document downloaded', { kind: input.kind });
  return {
    url: withDownloadName(data.signedUrl, fileName),
    expires_in: SIGNED_URL_TTL_SECONDS,
    file_name: fileName,
  };
}
