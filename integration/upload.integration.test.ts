/**
 * Phase 2 end-to-end checks against the local stack, through the same HTTP paths the app uses:
 * Storage (single request and TUS resumable), the served Edge Functions, signed downloads.
 * Requires `npm run db:start` and `npm run functions:serve`.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import { PDFDocument } from 'pdf-lib';

import { memorySource } from '@/features/upload/chunkSource';
import { resumableUpload, ResumableUploadError, UploadAbortedError } from '@/features/upload/resumable';

import { adminClient, appClient, localStatus } from './localSupabase';

const status = localStatus();
const admin = adminClient(status);
const client = appClient(status);
const MB = 1024 * 1024;
let userId: string;
let token: string;

async function pdfOfSize(pages: number, targetBytes: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  let remaining = targetBytes - (await doc.save()).length - 64 * 1024;
  while (remaining > 0) {
    const size = Math.min(MB, remaining);
    doc.context.register(doc.context.stream(new Uint8Array(randomBytes(size))));
    remaining -= size;
  }
  return doc.save({ useObjectStreams: false });
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function createDraft(title: string): Promise<string> {
  const { data, error } = await client
    .from('documents')
    .insert({ owner_id: userId, title })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

function tusOptions(documentId: string, bytes: Uint8Array) {
  return {
    endpoint: `${status.API_URL}/storage/v1/upload/resumable`,
    headers: { authorization: `Bearer ${token}`, apikey: status.ANON_KEY, 'x-upsert': 'false' },
    metadata: {
      bucketName: 'documents',
      objectName: `${userId}/${documentId}/original.pdf`,
      contentType: 'application/pdf',
      cacheControl: '3600',
    },
    source: memorySource(bytes),
    retryDelaysMs: [50, 50, 50],
  };
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json();
      throw Object.assign(new Error(payload.error?.code), {
        code: payload.error?.code,
        status: (error.context as Response).status,
      });
    }
    throw error;
  }
  return data as T;
}

beforeAll(async () => {
  const email = `upload.${Date.now()}@signflow.test`;
  const { error } = await admin.auth.admin.createUser({
    email,
    password: 'upload-test-pass1',
    email_confirm: true,
    user_metadata: { full_name: 'Upload Tester' },
  });
  if (error) throw error;
  const signIn = await client.auth.signInWithPassword({ email, password: 'upload-test-pass1' });
  if (signIn.error) throw signIn.error;
  userId = signIn.data.user.id;
  token = signIn.data.session.access_token;
});

describe('resumable (TUS) upload to local Storage', () => {
  it('uploads a 13 MB PDF in 6 MB chunks, survives a dropped connection, then processes and downloads it', async () => {
    const bytes = await pdfOfSize(12, 13 * MB);
    const id = await createDraft('Large contract');

    let patches = 0;
    const flakyFetch: typeof fetch = async (input, init) => {
      if (init?.method === 'PATCH' && ++patches === 2) throw new TypeError('Network request failed');
      return fetch(input, init);
    };
    const progress: number[] = [];
    await resumableUpload({
      ...tusOptions(id, bytes),
      fetchImpl: flakyFetch,
      onProgress: (sent) => progress.push(sent),
    });
    expect(progress[progress.length - 1]).toBe(bytes.length);
    expect(patches).toBeGreaterThanOrEqual(4); // 3 chunks + 1 retried

    const processed = await invoke<{ page_count: number; file_size_bytes: number; original_sha256: string }>(
      'process-upload',
      { document_id: id },
    );
    expect(processed).toEqual(
      expect.objectContaining({
        page_count: 12,
        file_size_bytes: bytes.length,
        original_sha256: sha256(bytes),
      }),
    );

    const { url, file_name } = await invoke<{ url: string; file_name: string }>('get-download-url', {
      document_id: id,
      kind: 'original',
    });
    expect(file_name).toBe('Large contract.pdf');
    // Same rebasing the app does (signed URLs are minted with the functions' internal host).
    const res = await fetch(url.replace(/^https?:\/\/[^/]+/, status.API_URL));
    expect(res.status).toBe(200);
    expect(sha256(new Uint8Array(await res.arrayBuffer()))).toBe(sha256(bytes));
  });

  it('can be cancelled and resumed from the stored upload URL', async () => {
    const bytes = await pdfOfSize(2, 7 * MB);
    const id = await createDraft('Resumed');
    const controller = new AbortController();
    let uploadUrl = '';
    const first = await resumableUpload({
      ...tusOptions(id, bytes),
      signal: controller.signal,
      onUploadUrl: (u) => (uploadUrl = u),
      onProgress: (sent) => sent > 0 && controller.abort(),
    }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(UploadAbortedError);

    const offsets: number[] = [];
    await resumableUpload({ ...tusOptions(id, bytes), uploadUrl, onProgress: (sent) => offsets.push(sent) });
    expect(offsets[0]).toBe(6 * MB); // resumed after the first chunk, not from zero
    const processed = await invoke<{ original_sha256: string }>('process-upload', { document_id: id });
    expect(processed.original_sha256).toBe(sha256(bytes));
  });

  it('refuses to overwrite an existing original (409) and storage rejects files over 25 MB (413)', async () => {
    const id = await createDraft('Duplicate');
    const small = await pdfOfSize(1, 7 * MB);
    await resumableUpload(tusOptions(id, small));
    const again = await resumableUpload(tusOptions(id, small)).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ResumableUploadError);
    expect((again as ResumableUploadError).status).toBe(409);

    const bigId = await createDraft('Too big');
    const big = { ...tusOptions(bigId, new Uint8Array(26 * MB)) };
    const tooBig = await resumableUpload(big).catch((e: unknown) => e);
    expect(tooBig).toBeInstanceOf(ResumableUploadError);
    expect((tooBig as ResumableUploadError).status).toBe(413);
  });
});

describe('Edge Functions over HTTP', () => {
  it('small upload → process → typed error envelope for a bad file → delete draft', async () => {
    const id = await createDraft('Small');
    const good = await pdfOfSize(3, 200_000);
    const up = await client.storage
      .from('documents')
      .upload(`${userId}/${id}/original.pdf`, good, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    expect((await invoke<{ page_count: number }>('process-upload', { document_id: id })).page_count).toBe(3);

    const badId = await createDraft('Not a PDF');
    await client.storage
      .from('documents')
      .upload(`${userId}/${badId}/original.pdf`, new TextEncoder().encode('hello, not a pdf'), {
        contentType: 'application/pdf',
      });
    await expect(invoke('process-upload', { document_id: badId })).rejects.toMatchObject({
      code: 'FILE_UNSUPPORTED',
      status: 422,
    });
    await expect(invoke('process-upload', { document_id: 'not-a-uuid' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
    });

    expect(await invoke('delete-draft', { document_id: id })).toEqual({ document_id: id, deleted: true });
    const { data } = await client.from('documents').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  it('rejects calls without a valid user token', async () => {
    const res = await fetch(`${status.API_URL}/functions/v1/process-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: status.ANON_KEY,
        Authorization: `Bearer ${status.ANON_KEY}`,
      },
      body: JSON.stringify({ document_id: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it('logs DOCUMENT_UPLOADED and DOCUMENT_DOWNLOADED with the caller IP from the gateway', async () => {
    const id = await createDraft('Audited');
    await client.storage
      .from('documents')
      .upload(`${userId}/${id}/original.pdf`, await pdfOfSize(1, 50_000), { contentType: 'application/pdf' });
    await invoke('process-upload', { document_id: id });
    await invoke('get-download-url', { document_id: id, kind: 'original' });
    const { data } = await admin
      .from('document_events')
      .select('type, ip, user_agent')
      .eq('document_id', id)
      .order('id');
    expect(data?.map((e) => e.type)).toEqual([
      'DOCUMENT_CREATED',
      'DOCUMENT_UPLOADED',
      'DOCUMENT_DOWNLOADED',
    ]);
    expect(data?.[1]?.ip).toBeTruthy();
    expect(data?.[0]?.ip).toBeTruthy(); // trigger reads PostgREST's request headers too
  });
});
