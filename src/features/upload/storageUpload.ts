import { Platform } from 'react-native';

import { RESUMABLE_UPLOAD_THRESHOLD_BYTES } from '@shared/limits';
import { AppError } from '@shared/errors';

import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import type { ChunkSource } from './chunkSource';
import { resumableUpload, ResumableUploadError, UploadAbortedError } from './resumable';

export type UploadOutcome = 'uploaded' | 'already-exists';

export interface StorageUploadOptions {
  bucket: 'documents' | 'uploads-tmp' | 'avatars';
  path: string;
  contentType: string;
  source: ChunkSource;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  upsert?: boolean;
}

function statusToError(status: number, message: string): AppError {
  if (status === 413) return new AppError('FILE_TOO_LARGE', message);
  if (status === 415 || status === 400) return new AppError('FILE_UNSUPPORTED', message);
  if (status === 401 || status === 403) return new AppError('FORBIDDEN', message);
  if (status === 429) return new AppError('RATE_LIMITED', message);
  return new AppError('UPLOAD_FAILED', message);
}

async function binaryFetch(): Promise<typeof fetch> {
  // expo/fetch sends Uint8Array bodies natively; the global fetch does on web.
  if (Platform.OS === 'web') return fetch;
  const mod = await import('expo/fetch');
  return mod.fetch as unknown as typeof fetch;
}

/**
 * Uploads to Supabase Storage as the signed-in user: one request up to 6 MB, resumable (TUS) above
 * that, with progress, cancel and automatic resume after brief network drops. A 409 means the object
 * already exists (e.g. a retry after the upload finished but processing did not).
 */
export async function uploadToStorage(options: StorageUploadOptions): Promise<UploadOutcome> {
  const { bucket, path, contentType, source, onProgress, signal, upsert = false } = options;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('FORBIDDEN', 'Not signed in');

  try {
    if (source.size <= RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      onProgress?.(0);
      const bytes = await source.read(0, source.size);
      source.close();
      if (signal?.aborted) throw new UploadAbortedError();
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert });
      if (error) {
        const status = Number((error as { statusCode?: string | number }).statusCode ?? 0);
        if (status === 409) return 'already-exists';
        throw statusToError(status, error.message);
      }
      onProgress?.(1);
      return 'uploaded';
    }

    await resumableUpload({
      endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${token}`,
        apikey: env.supabaseAnonKey,
        'x-upsert': upsert ? 'true' : 'false',
      },
      metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: '3600' },
      source,
      onProgress: (sent, total) => onProgress?.(total === 0 ? 1 : sent / total),
      signal,
      fetchImpl: await binaryFetch(),
    });
    return 'uploaded';
  } catch (error) {
    if (error instanceof ResumableUploadError) {
      if (error.status === 409) return 'already-exists';
      throw statusToError(error.status, error.message);
    }
    if (error instanceof UploadAbortedError || error instanceof AppError) throw error;
    throw new AppError('NETWORK_OFFLINE', undefined, { cause: error });
  }
}
