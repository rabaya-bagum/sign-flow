import { AppError } from '@shared/errors';

import { resizeTarget } from '../normalizeImage';

const mockCreateDraft = jest.fn();
const mockProcess = jest.fn();
const mockUpload = jest.fn();
const mockSource = jest.fn();

jest.mock('@/features/documents/api', () => ({
  createDraft: (...a: unknown[]) => mockCreateDraft(...a),
  processUpload: (...a: unknown[]) => mockProcess(...a),
}));
jest.mock('../storageUpload', () => ({ uploadToStorage: (...a: unknown[]) => mockUpload(...a) }));
jest.mock('../chunkSource', () => ({
  fileUriSource: (...a: unknown[]) => mockSource(...a),
  blobSource: jest.fn(),
}));
jest.mock('../normalizeImage', () => ({
  ...jest.requireActual('../normalizeImage'),
  normalizeImage: async (uri: string) => ({ uri: `${uri}.jpg`, width: 100, height: 100 }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } } }) } },
}));

// eslint-disable-next-line import/first
import { uploadImagesDocument, uploadPdfDocument, validatePdfCandidate } from '../uploadDocument';

const processed = { document_id: 'doc-1', page_count: 3, file_size_bytes: 1000, original_sha256: 'abc' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateDraft.mockResolvedValue('doc-1');
  mockProcess.mockResolvedValue(processed);
  mockUpload.mockResolvedValue('uploaded');
  mockSource.mockResolvedValue({ size: 1000, read: jest.fn(), close: jest.fn() });
});

describe('validatePdfCandidate', () => {
  it('accepts PDFs by MIME type or extension', () => {
    expect(() => validatePdfCandidate({ name: 'a.pdf', mimeType: null, size: 10 })).not.toThrow();
    expect(() => validatePdfCandidate({ name: 'a', mimeType: 'application/pdf', size: null })).not.toThrow();
  });

  it('rejects other types and oversized files before uploading', () => {
    expect(() => validatePdfCandidate({ name: 'a.docx', mimeType: 'application/msword', size: 10 })).toThrow(
      expect.objectContaining({ code: 'FILE_UNSUPPORTED' }),
    );
    expect(() =>
      validatePdfCandidate({ name: 'a.pdf', mimeType: 'application/pdf', size: 26 * 1024 * 1024 }),
    ).toThrow(expect.objectContaining({ code: 'FILE_TOO_LARGE' }));
  });
});

describe('uploadPdfDocument', () => {
  const pdf = { uri: 'file:///a.pdf', name: 'a.pdf', size: 1000, mimeType: 'application/pdf' };

  it('creates the draft, uploads original.pdf, then processes it', async () => {
    const stages: string[] = [];
    const created: string[] = [];
    const result = await uploadPdfDocument(pdf, 'A', {
      onStage: (s) => stages.push(s),
      onDraftCreated: (id) => created.push(id),
    });
    expect(mockCreateDraft).toHaveBeenCalledWith('A');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'documents',
        path: 'owner-1/doc-1/original.pdf',
        contentType: 'application/pdf',
      }),
    );
    expect(mockProcess).toHaveBeenCalledWith('doc-1');
    expect(stages).toEqual(['preparing', 'uploading', 'processing']);
    expect(created).toEqual(['doc-1']);
    expect(result).toEqual({ documentId: 'doc-1', ...processed });
  });

  it('reuses an existing draft and still processes when the file already exists', async () => {
    mockUpload.mockResolvedValue('already-exists');
    await uploadPdfDocument(pdf, 'A', { documentId: 'existing' });
    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(mockProcess).toHaveBeenCalledWith('existing');
  });

  it('checks the real size before creating anything', async () => {
    mockSource.mockResolvedValue({ size: 30 * 1024 * 1024, read: jest.fn(), close: jest.fn() });
    await expect(uploadPdfDocument({ ...pdf, size: null }, 'A')).rejects.toEqual(
      new AppError('FILE_TOO_LARGE'),
    );
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});

describe('uploadImagesDocument', () => {
  it('stages normalized JPEGs in uploads-tmp and converts them in order', async () => {
    await uploadImagesDocument(
      [
        { uri: 'file:///1', width: 1, height: 1, mimeType: 'image/heic' },
        { uri: 'file:///2', width: 1, height: 1, mimeType: 'image/png' },
      ],
      'Scan',
    );
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpload.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        bucket: 'uploads-tmp',
        contentType: 'image/jpeg',
        path: 'owner-1/uuid-1.jpg',
      }),
    );
    expect(mockSource.mock.calls.map((c) => c[0])).toEqual(['file:///1.jpg', 'file:///2.jpg']);
    expect(mockProcess).toHaveBeenCalledWith('doc-1', ['owner-1/uuid-1.jpg', 'owner-1/uuid-1.jpg']);
  });

  it('refuses more than 30 images', async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ uri: `${i}`, width: 1, height: 1, mimeType: null }));
    await expect(uploadImagesDocument(many, 'Scan')).rejects.toEqual(new AppError('FILE_TOO_LARGE'));
  });
});

describe('resizeTarget', () => {
  it('caps the long edge at 2500 px and leaves smaller images alone', () => {
    expect(resizeTarget(4000, 3000)).toEqual({ width: 2500 });
    expect(resizeTarget(3000, 4000)).toEqual({ height: 2500 });
    expect(resizeTarget(2500, 1000)).toBeNull();
  });
});
