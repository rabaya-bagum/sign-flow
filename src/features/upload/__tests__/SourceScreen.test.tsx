import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppError } from '@shared/errors';

import { renderWithProviders } from '@/test/render';

import * as pickers from '../pickers';
import { UploadAbortedError } from '../resumable';
import { SourceScreen } from '../screens/SourceScreen';
import * as upload from '../uploadDocument';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('../pickers', () => ({
  pickPdf: jest.fn(),
  pickImages: jest.fn(),
  scanDocument: jest.fn(),
  isScannerAvailable: () => true,
}));
jest.mock('../uploadDocument', () => ({ uploadPdfDocument: jest.fn(), uploadImagesDocument: jest.fn() }));
jest.mock('@/features/documents/api', () => ({ titleFromFileName: (n: string) => n.replace(/\.pdf$/, '') }));

const mockPickers = jest.mocked(pickers);
const mockUpload = jest.mocked(upload);
const result = {
  documentId: 'doc-1',
  document_id: 'doc-1',
  page_count: 3,
  file_size_bytes: 10,
  original_sha256: 'x',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

describe('SourceScreen', () => {
  it('uploads a picked PDF titled from its file name, then opens the details step', async () => {
    mockPickers.pickPdf.mockResolvedValue({
      uri: 'file:///a.pdf',
      name: 'Mutual NDA.pdf',
      size: 10,
      mimeType: 'application/pdf',
    });
    mockUpload.uploadPdfDocument.mockResolvedValue(result);
    await renderWithProviders(<SourceScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Choose PDF/ }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/documents/new/details',
        params: { id: 'doc-1' },
      }),
    );
    expect(mockUpload.uploadPdfDocument).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mutual NDA.pdf' }),
      'Mutual NDA',
      expect.any(Object),
    );
  });

  it('resumes an existing draft when opened with ?documentId', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ documentId: 'existing' });
    mockPickers.pickPdf.mockResolvedValue({
      uri: 'file:///a.pdf',
      name: 'a.pdf',
      size: 10,
      mimeType: 'application/pdf',
    });
    mockUpload.uploadPdfDocument.mockResolvedValue({ ...result, documentId: 'existing' });
    await renderWithProviders(<SourceScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Choose PDF/ }));
    await waitFor(() => expect(mockUpload.uploadPdfDocument).toHaveBeenCalled());
    expect(mockUpload.uploadPdfDocument.mock.calls[0]![2]).toEqual(
      expect.objectContaining({ documentId: 'existing' }),
    );
  });

  it('shows the SPEC §15 copy when the server rejects the file', async () => {
    mockPickers.pickPdf.mockResolvedValue({
      uri: 'file:///a.pdf',
      name: 'a.pdf',
      size: 10,
      mimeType: 'application/pdf',
    });
    mockUpload.uploadPdfDocument.mockRejectedValue(new AppError('PDF_RENDER_FAILED'));
    await renderWithProviders(<SourceScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Choose PDF/ }));
    expect(await screen.findByText(/couldn't read this PDF/)).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('explains a cancelled upload', async () => {
    mockPickers.pickPdf.mockResolvedValue({
      uri: 'file:///a.pdf',
      name: 'a.pdf',
      size: 10,
      mimeType: 'application/pdf',
    });
    mockUpload.uploadPdfDocument.mockRejectedValue(new UploadAbortedError());
    await renderWithProviders(<SourceScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Choose PDF/ }));
    expect(await screen.findByText(/Upload cancelled/)).toBeOnTheScreen();
  });

  it('lets the user reorder and remove photos with buttons before creating the PDF', async () => {
    const img = (n: number) => ({ uri: `file:///${n}.jpg`, width: 10, height: 10, mimeType: 'image/jpeg' });
    mockPickers.pickImages.mockResolvedValue([img(1), img(2), img(3)]);
    mockUpload.uploadImagesDocument.mockResolvedValue(result);
    await renderWithProviders(<SourceScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Photos to PDF/ }));
    expect(await screen.findByText('3 pages selected')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Move down, Page 1' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove page 3' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create PDF' }));
    await waitFor(() => expect(mockUpload.uploadImagesDocument).toHaveBeenCalled());
    expect(mockUpload.uploadImagesDocument.mock.calls[0]![0].map((i) => i.uri)).toEqual([
      'file:///2.jpg',
      'file:///1.jpg',
    ]);
    expect(mockUpload.uploadImagesDocument.mock.calls[0]![1]).toMatch(/^Photos \d{4}-\d{2}-\d{2}$/);
  });
});
