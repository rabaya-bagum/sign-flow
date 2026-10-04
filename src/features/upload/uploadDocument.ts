import * as Crypto from 'expo-crypto';

import { AppError } from '@shared/errors';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_CONVERSION, MAX_PDF_BYTES } from '@shared/limits';

import { createDraft, processUpload, type ProcessUploadResult } from '@/features/documents/api';
import { supabase } from '@/lib/supabase';

import { blobSource, fileUriSource, type ChunkSource } from './chunkSource';
import { normalizeImage } from './normalizeImage';
import type { PickedImage, PickedPdf } from './pickers';
import { uploadToStorage } from './storageUpload';

export type UploadStage = 'preparing' | 'uploading' | 'processing';

export interface UploadCallbacks {
  onStage?: (stage: UploadStage) => void;
  /** 0..1 for the uploading stage. */
  onProgress?: (fraction: number) => void;
  /** Called as soon as the draft exists, so the UI can offer "resume later". */
  onDraftCreated?: (documentId: string) => void;
  signal?: AbortSignal;
}

export interface UploadResult extends ProcessUploadResult {
  documentId: string;
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('FORBIDDEN');
  return id;
}

/** Client-side checks before anything is uploaded (the server re-checks everything). */
export function validatePdfCandidate(pdf: Pick<PickedPdf, 'name' | 'mimeType' | 'size'>): void {
  const looksPdf = pdf.mimeType === 'application/pdf' || /\.pdf$/i.test(pdf.name);
  if (!looksPdf) throw new AppError('FILE_UNSUPPORTED');
  if (pdf.size !== null && pdf.size > MAX_PDF_BYTES) throw new AppError('FILE_TOO_LARGE');
}

export function validateImageCount(count: number): void {
  if (count < 1) throw new AppError('INVALID_INPUT');
  if (count > MAX_IMAGES_PER_CONVERSION) throw new AppError('FILE_TOO_LARGE');
}

async function ensureDraft(
  documentId: string | undefined,
  title: string,
  cb: UploadCallbacks,
): Promise<string> {
  const id = documentId ?? (await createDraft(title));
  cb.onDraftCreated?.(id);
  return id;
}

/** PDF from Files: create (or reuse) the draft, upload original.pdf, then process it server-side. */
export async function uploadPdfDocument(
  pdf: PickedPdf,
  title: string,
  cb: UploadCallbacks & { documentId?: string } = {},
): Promise<UploadResult> {
  validatePdfCandidate(pdf);
  cb.onStage?.('preparing');
  const source: ChunkSource = pdf.file ? blobSource(pdf.file) : await fileUriSource(pdf.uri);
  if (source.size > MAX_PDF_BYTES) {
    source.close();
    throw new AppError('FILE_TOO_LARGE');
  }
  const owner = await userId();
  const documentId = await ensureDraft(cb.documentId, title, cb);

  cb.onStage?.('uploading');
  // 'already-exists' = a previous attempt uploaded the file but processing did not finish.
  await uploadToStorage({
    bucket: 'documents',
    path: `${owner}/${documentId}/original.pdf`,
    contentType: 'application/pdf',
    source,
    onProgress: cb.onProgress,
    signal: cb.signal,
  });

  cb.onStage?.('processing');
  return { documentId, ...(await processUpload(documentId)) };
}

/** Scans/photos: normalize to JPEG, stage in uploads-tmp, then convert to one PDF server-side. */
export async function uploadImagesDocument(
  images: PickedImage[],
  title: string,
  cb: UploadCallbacks & { documentId?: string } = {},
): Promise<UploadResult> {
  validateImageCount(images.length);
  cb.onStage?.('preparing');
  const normalized = [];
  for (const image of images) normalized.push(await normalizeImage(image.uri));

  const owner = await userId();
  const documentId = await ensureDraft(cb.documentId, title, cb);

  cb.onStage?.('uploading');
  const paths: string[] = [];
  for (const [index, image] of normalized.entries()) {
    const source = await fileUriSource(image.uri);
    if (source.size > MAX_IMAGE_BYTES) {
      source.close();
      throw new AppError('FILE_TOO_LARGE');
    }
    const path = `${owner}/${Crypto.randomUUID()}.jpg`;
    await uploadToStorage({
      bucket: 'uploads-tmp',
      path,
      contentType: 'image/jpeg',
      source,
      signal: cb.signal,
      onProgress: (f) => cb.onProgress?.((index + f) / normalized.length),
    });
    paths.push(path);
  }

  cb.onStage?.('processing');
  return { documentId, ...(await processUpload(documentId, paths)) };
}
