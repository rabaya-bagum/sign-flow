import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_CONVERSION,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
} from '../../../shared/limits.ts';
import type { RequestContext } from '../_shared/context.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { z } from '../_shared/deps.ts';
import { loadOwnedDocument, originalPath, type DocumentRow } from '../_shared/documents.ts';
import { logEvent } from '../_shared/events.ts';
import { HttpError } from '../_shared/http.ts';
import { imagesToPdf } from '../_shared/pdf/images.ts';
import { inspectPdf } from '../_shared/pdf/inspect.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

export const ProcessUploadInput = z.object({
  document_id: z.uuid(),
  /** uploads-tmp object paths (in page order) to convert into the original PDF. */
  image_paths: z.array(z.string().min(1).max(512)).min(1).max(MAX_IMAGES_PER_CONVERSION).optional(),
});

export interface ProcessUploadResult {
  document_id: string;
  page_count: number;
  file_size_bytes: number;
  original_sha256: string;
}

const RATE_LIMIT = { max: 30, windowSeconds: 3600 };

function resultFrom(doc: DocumentRow): ProcessUploadResult {
  return {
    document_id: doc.id,
    page_count: doc.page_count ?? 0,
    file_size_bytes: doc.file_size_bytes ?? 0,
    original_sha256: doc.original_sha256 ?? '',
  };
}

async function download(ctx: RequestContext, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await ctx.admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function buildFromImages(ctx: RequestContext, paths: string[], target: string): Promise<Uint8Array> {
  for (const p of paths) {
    if (!p.startsWith(`${ctx.userId}/`) || p.includes('..')) {
      throw new HttpError('FORBIDDEN', 403, 'Images must come from your own upload folder');
    }
  }
  let pdf: Uint8Array;
  try {
    const images: Uint8Array[] = [];
    for (const p of paths) {
      const bytes = await download(ctx, 'uploads-tmp', p);
      if (!bytes) throw new HttpError('UPLOAD_FAILED', 422, 'An image upload is missing; upload it again');
      if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError('FILE_TOO_LARGE', 413, 'Image exceeds 10 MB');
      images.push(bytes);
    }
    pdf = await imagesToPdf(images);
  } finally {
    // Temp images are single-use: remove them whether or not conversion succeeded.
    await ctx.admin.storage.from('uploads-tmp').remove(paths);
  }
  if (pdf.length > MAX_PDF_BYTES)
    throw new HttpError('FILE_TOO_LARGE', 413, 'The converted PDF exceeds 25 MB');
  const { error } = await ctx.admin.storage
    .from('documents')
    .upload(target, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  return pdf;
}

/**
 * Validates and records a draft's original PDF (SPEC §10): either a PDF the owner uploaded to
 * documents/{owner}/{id}/original.pdf, or JPEG/PNG images in uploads-tmp converted to a PDF.
 * Idempotent: a document that is already processed returns its stored result.
 */
export async function processUpload(
  input: z.output<typeof ProcessUploadInput>,
  ctx: RequestContext,
): Promise<ProcessUploadResult> {
  const doc = await loadOwnedDocument(ctx, input.document_id);
  if (doc.original_path) return resultFrom(doc);
  if (doc.status !== 'draft') throw new HttpError('INVALID_STATE', 409, 'Only drafts can receive a file');

  await enforceRateLimit(ctx.admin, `process-upload:${ctx.userId}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds);

  const path = originalPath(doc.owner_id, doc.id);
  let bytes: Uint8Array;
  let details: { pageCount: number; pages: unknown[]; sha256: string };

  try {
    if (input.image_paths) {
      bytes = await buildFromImages(ctx, input.image_paths, path);
    } else {
      const downloaded = await download(ctx, 'documents', path);
      if (!downloaded) throw new HttpError('UPLOAD_FAILED', 422, 'Upload the file before processing it');
      bytes = downloaded;
    }
    if (bytes.length > MAX_PDF_BYTES) throw new HttpError('FILE_TOO_LARGE', 413, 'PDF exceeds 25 MB');
    const info = await inspectPdf(bytes);
    if (info.pageCount > MAX_PDF_PAGES) throw new HttpError('FILE_TOO_LARGE', 413, 'PDF exceeds 200 pages');
    details = { pageCount: info.pageCount, pages: info.pages, sha256: await sha256Hex(bytes) };
  } catch (error) {
    // Rejected files must not linger; the draft stays without a file so the user can retry.
    await ctx.admin.storage.from('documents').remove([path]);
    throw error;
  }

  const { data: finalized, error } = await ctx.admin.rpc('finalize_original_upload', {
    p_document_id: doc.id,
    p_path: path,
    p_sha256: details.sha256,
    p_size_bytes: bytes.length,
    p_pages: details.pages,
  });
  if (error) throw error;
  if (!finalized) {
    // A concurrent request finished first (or the draft changed state); report the stored result.
    const current = await loadOwnedDocument(ctx, doc.id);
    if (current.original_path) return resultFrom(current);
    throw new HttpError('INVALID_STATE', 409, 'The document can no longer receive a file');
  }

  await logEvent(ctx, doc.id, 'DOCUMENT_UPLOADED', 'Document uploaded', {
    source: input.image_paths ? 'images' : 'pdf',
    image_count: input.image_paths?.length ?? 0,
    page_count: details.pageCount,
    file_size_bytes: bytes.length,
  });

  return {
    document_id: doc.id,
    page_count: details.pageCount,
    file_size_bytes: bytes.length,
    original_sha256: details.sha256,
  };
}
