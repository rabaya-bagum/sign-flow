import { base64Utf8 } from '@/lib/base64';
import type { ChunkSource } from './chunkSource';

/**
 * Minimal TUS 1.0 client for Supabase Storage resumable uploads (SPEC §9, Phase 2 prompt §C).
 *
 * Why not tus-js-client: on React Native its Blob path re-reads the entire file for every chunk
 * (expo-file-system's File.slice loads all bytes). This client reads each chunk through a
 * ChunkSource instead, and is fully testable against the real local Storage endpoint.
 */

export const SUPABASE_TUS_CHUNK_SIZE = 6 * 1024 * 1024; // Supabase requires exactly 6 MB chunks.
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 5000, 10000, 20000];

export class ResumableUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ResumableUploadError';
  }
}

export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadAbortedError';
  }
}

export interface ResumableUploadOptions {
  /** `${SUPABASE_URL}/storage/v1/upload/resumable` */
  endpoint: string;
  /** authorization, apikey, x-upsert… */
  headers: Record<string, string>;
  /** bucketName, objectName, contentType, cacheControl */
  metadata: Record<string, string>;
  source: ChunkSource;
  chunkSize?: number;
  retryDelaysMs?: number[];
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
  /** Existing upload URL to resume. */
  uploadUrl?: string;
  onUploadUrl?: (url: string) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([408, 423, 429, 500, 502, 503, 504]);

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError || (error instanceof Error && /network|fetch|timed? ?out/i.test(error.message))
  );
}

/** Resolves a TUS Location header without `URL` (React Native's URL implementation is partial). */
export function resolveLocation(location: string, endpoint: string): string {
  if (/^https?:\/\//i.test(location)) return location;
  const origin = /^https?:\/\/[^/]+/i.exec(endpoint)?.[0] ?? '';
  return location.startsWith('/') ? origin + location : `${endpoint.replace(/\/$/, '')}/${location}`;
}

function encodeMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([k, v]) => `${k} ${base64Utf8(v)}`)
    .join(',');
}

async function errorText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return res.statusText;
  }
}

export async function resumableUpload(options: ResumableUploadOptions): Promise<{ uploadUrl: string }> {
  const {
    endpoint,
    headers,
    metadata,
    source,
    chunkSize = SUPABASE_TUS_CHUNK_SIZE,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    onProgress,
    signal,
    onUploadUrl,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = options;
  const tus = { ...headers, 'Tus-Resumable': '1.0.0' };
  const total = source.size;

  const checkAbort = () => {
    if (signal?.aborted) throw new UploadAbortedError();
  };

  /** Runs `attempt`, retrying network errors and retryable statuses with backoff. */
  async function withRetries<T>(attempt: () => Promise<T>, onRetry?: () => Promise<void>): Promise<T> {
    for (let i = 0; ; i++) {
      checkAbort();
      try {
        return await attempt();
      } catch (error) {
        if (signal?.aborted) throw new UploadAbortedError();
        const retryable =
          isNetworkError(error) ||
          (error instanceof ResumableUploadError && RETRYABLE_STATUS.has(error.status));
        if (!retryable || i >= retryDelaysMs.length) throw error;
        await sleep(retryDelaysMs[i]!);
        if (onRetry) await onRetry();
      }
    }
  }

  let uploadUrl = options.uploadUrl;
  if (!uploadUrl) {
    uploadUrl = await withRetries(async () => {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { ...tus, 'Upload-Length': String(total), 'Upload-Metadata': encodeMetadata(metadata) },
        signal,
      });
      if (res.status !== 201) throw new ResumableUploadError(res.status, await errorText(res));
      const location = res.headers.get('Location');
      if (!location) throw new ResumableUploadError(res.status, 'Missing Location header');
      return resolveLocation(location, endpoint);
    });
    onUploadUrl?.(uploadUrl);
  }
  const url = uploadUrl;

  async function serverOffset(): Promise<number> {
    const res = await fetchImpl(url, { method: 'HEAD', headers: tus, signal });
    if (res.status !== 200 && res.status !== 204)
      throw new ResumableUploadError(res.status, 'Upload not found');
    return Number(res.headers.get('Upload-Offset') ?? '0');
  }

  let offset = options.uploadUrl ? await withRetries(serverOffset) : 0;
  onProgress?.(offset, total);

  try {
    while (offset < total) {
      offset = await withRetries(
        async () => {
          const chunk = await source.read(offset, Math.min(chunkSize, total - offset));
          const res = await fetchImpl(url, {
            method: 'PATCH',
            headers: {
              ...tus,
              'Upload-Offset': String(offset),
              'Content-Type': 'application/offset+octet-stream',
            },
            body: chunk as unknown as BodyInit,
            signal,
          });
          if (res.status !== 204) throw new ResumableUploadError(res.status, await errorText(res));
          return Number(res.headers.get('Upload-Offset') ?? offset + chunk.length);
        },
        // After a failure, ask the server how much it actually received before resending.
        async () => {
          offset = await serverOffset();
        },
      );
      onProgress?.(offset, total);
    }
  } finally {
    source.close();
  }
  return { uploadUrl: url };
}
