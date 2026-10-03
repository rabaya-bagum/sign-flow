import { base64Utf8 } from '../base64';
import { memorySource } from '../chunkSource';
import { resumableUpload, ResumableUploadError, UploadAbortedError } from '../resumable';

/** In-memory TUS server: records chunks, can drop the connection after N PATCH requests. */
function fakeTusServer({ failPatchNumbers = [] as number[], createStatus = 201 } = {}) {
  const received: number[] = [];
  let length = 0;
  let offset = 0;
  let patches = 0;
  const calls: string[] = [];
  const fetchImpl = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = init?.headers as Record<string, string>;
    calls.push(method);
    if (method === 'POST') {
      if (createStatus !== 201) return new Response('nope', { status: createStatus });
      length = Number(headers['Upload-Length']);
      return new Response(null, { status: 201, headers: { Location: '/storage/v1/upload/resumable/abc' } });
    }
    if (method === 'HEAD')
      return new Response(null, { status: 200, headers: { 'Upload-Offset': String(offset) } });
    if (method === 'PATCH') {
      patches += 1;
      const body = init?.body as Uint8Array;
      if (failPatchNumbers.includes(patches)) {
        // Simulate a dropped connection after the server stored half the chunk.
        offset += Math.floor(body.length / 2);
        received.push(Math.floor(body.length / 2));
        throw new TypeError('Network request failed');
      }
      if (Number(headers['Upload-Offset']) !== offset)
        return new Response('offset mismatch', { status: 409 });
      offset += body.length;
      received.push(body.length);
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(offset) } });
    }
    return new Response(null, { status: 405 });
  });
  return { fetchImpl, received, calls, state: () => ({ length, offset }) };
}

const base = {
  endpoint: 'http://localhost:54321/storage/v1/upload/resumable',
  headers: { authorization: 'Bearer t' },
  metadata: { bucketName: 'documents', objectName: 'u/d/original.pdf', contentType: 'application/pdf' },
  sleep: async () => undefined,
};

describe('resumableUpload', () => {
  it('creates the upload and sends fixed-size chunks with progress', async () => {
    const server = fakeTusServer();
    const progress: number[] = [];
    const { uploadUrl } = await resumableUpload({
      ...base,
      source: memorySource(new Uint8Array(25)),
      chunkSize: 10,
      fetchImpl: server.fetchImpl as unknown as typeof fetch,
      onProgress: (sent) => progress.push(sent),
    });
    expect(uploadUrl).toBe('http://localhost:54321/storage/v1/upload/resumable/abc');
    expect(server.received).toEqual([10, 10, 5]);
    expect(progress).toEqual([0, 10, 20, 25]);
    expect(server.state()).toEqual({ length: 25, offset: 25 });
    const createHeaders = server.fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(createHeaders['Tus-Resumable']).toBe('1.0.0');
    expect(createHeaders['Upload-Metadata']).toContain(`objectName ${base64Utf8('u/d/original.pdf')}`);
  });

  it('resumes from the server offset after a dropped connection', async () => {
    const server = fakeTusServer({ failPatchNumbers: [2] });
    await resumableUpload({
      ...base,
      source: memorySource(new Uint8Array(30)),
      chunkSize: 10,
      fetchImpl: server.fetchImpl as unknown as typeof fetch,
    });
    expect(server.state().offset).toBe(30);
    // POST, PATCH ok, PATCH dropped, HEAD (offset 15), then the rest from 15.
    expect(server.calls).toEqual(['POST', 'PATCH', 'PATCH', 'HEAD', 'PATCH', 'PATCH']);
    expect(server.received).toEqual([10, 5, 10, 5]);
  });

  it('gives up after the retry budget', async () => {
    const server = fakeTusServer({ failPatchNumbers: [1, 2, 3] });
    await expect(
      resumableUpload({
        ...base,
        source: memorySource(new Uint8Array(30)),
        chunkSize: 10,
        retryDelaysMs: [1, 1],
        fetchImpl: server.fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('surfaces non-retryable statuses (e.g. 409 object exists, 413 too large)', async () => {
    for (const status of [409, 413]) {
      const server = fakeTusServer({ createStatus: status });
      const error = await resumableUpload({
        ...base,
        source: memorySource(new Uint8Array(5)),
        fetchImpl: server.fetchImpl as unknown as typeof fetch,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ResumableUploadError);
      expect((error as ResumableUploadError).status).toBe(status);
    }
  });

  it('stops when cancelled', async () => {
    const server = fakeTusServer();
    const controller = new AbortController();
    const error = await resumableUpload({
      ...base,
      source: memorySource(new Uint8Array(30)),
      chunkSize: 10,
      fetchImpl: server.fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
      onProgress: (sent) => {
        if (sent >= 10) controller.abort();
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadAbortedError);
    expect(server.state().offset).toBe(10);
  });

  it('resumes an existing upload URL from its current offset', async () => {
    const server = fakeTusServer();
    await resumableUpload({
      ...base,
      source: memorySource(new Uint8Array(20)),
      chunkSize: 10,
      fetchImpl: server.fetchImpl as unknown as typeof fetch,
    });
    const again = fakeTusServer();
    await resumableUpload({
      ...base,
      uploadUrl: 'http://localhost:54321/storage/v1/upload/resumable/abc',
      source: memorySource(new Uint8Array(20)),
      chunkSize: 10,
      fetchImpl: again.fetchImpl as unknown as typeof fetch,
    });
    expect(again.calls[0]).toBe('HEAD');
    expect(again.calls).not.toContain('POST');
  });
});

describe('base64Utf8', () => {
  it('matches Buffer for ASCII and UTF-8', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'documents', 'Résumé – 合同.pdf']) {
      expect(base64Utf8(s)).toBe(Buffer.from(s, 'utf8').toString('base64'));
    }
  });
});
