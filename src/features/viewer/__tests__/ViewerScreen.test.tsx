import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import * as documentsApi from '@/features/documents/api';
import * as download from '@/features/documents/download';
import { renderWithProviders } from '@/test/render';

import type { PdfSurfaceProps } from '../types';
import { nextZoom, ViewerScreen } from '../ViewerScreen';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'd1' }),
  // Render the header's right button so the share action can be pressed.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('@/features/documents/api', () => ({
  getDocument: jest.fn(async () => ({ id: 'd1', title: 'Lease.pdf' })),
  getViewUrl: jest.fn(),
}));
jest.mock('@/features/documents/download', () => ({
  toAppUrl: (url: string) => url,
  shareDocument: jest.fn(async () => undefined),
}));

const mockSurface = { props: null as PdfSurfaceProps | null, goToPage: jest.fn(), setZoom: jest.fn() };
jest.mock('../PdfSurface', () => ({
  PdfSurface: ({ ref, ...props }: PdfSurfaceProps & { ref?: React.Ref<unknown> }) => {
    mockSurface.props = props;
    jest
      .requireActual<typeof import('react')>('react')
      .useImperativeHandle(ref, () => ({ goToPage: mockSurface.goToPage, setZoom: mockSurface.setZoom }));
    return null;
  },
}));

const api = jest.mocked(documentsApi);

beforeEach(() => {
  jest.clearAllMocks();
  mockSurface.props = null;
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
  api.getViewUrl.mockResolvedValue({
    url: 'https://p.test/doc.pdf?token=1',
    expires_in: 300,
    file_name: 'Lease.pdf',
  });
});

describe('ViewerScreen', () => {
  it('loads the view URL, then shows the page indicator and zoom controls', async () => {
    await renderWithProviders(<ViewerScreen />);
    await waitFor(() => expect(mockSurface.props?.url).toBe('https://p.test/doc.pdf?token=1'));
    expect(api.getViewUrl).toHaveBeenCalledWith('d1');
    expect(screen.queryByTestId('viewer-page')).toBeNull(); // until loaded

    await act(async () => mockSurface.props!.onLoaded!({ pageCount: 12, pages: [] }));
    await act(async () => mockSurface.props!.onPageChanged!(3, 12));
    expect(screen.getByRole('button', { name: 'Page 3 of 12. Choose a page' })).toBeOnTheScreen();
    expect(screen.getByText('3 / 12')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    expect(mockSurface.setZoom).toHaveBeenLastCalledWith(1.5);
    expect(screen.getByText('150%')).toBeOnTheScreen();
    await act(async () => mockSurface.props!.onZoomChanged!(3.2)); // pinch
    await fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    expect(mockSurface.setZoom).toHaveBeenLastCalledWith(4);
  });

  it('jumps to a page from the page sheet', async () => {
    await renderWithProviders(<ViewerScreen />);
    await waitFor(() => expect(mockSurface.props?.url).toBeTruthy());
    await act(async () => mockSurface.props!.onLoaded!({ pageCount: 5, pages: [] }));
    await fireEvent.press(screen.getByTestId('viewer-page'));
    await fireEvent.press(screen.getByRole('button', { name: 'Page 4' }));
    expect(mockSurface.goToPage).toHaveBeenCalledWith(4);
  });

  it('shows PDF_RENDER_FAILED with a retry that fetches a fresh URL', async () => {
    await renderWithProviders(<ViewerScreen />);
    await waitFor(() => expect(mockSurface.props?.url).toBeTruthy());
    await act(async () => mockSurface.props!.onError!({ code: 'PDF_RENDER_FAILED', message: 'Invalid PDF' }));
    expect(screen.getByText(/couldn't open this document.*damaged/)).toBeOnTheScreen();

    api.getViewUrl.mockResolvedValue({
      url: 'https://p.test/doc.pdf?token=2',
      expires_in: 300,
      file_name: 'Lease.pdf',
    });
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(mockSurface.props?.url).toBe('https://p.test/doc.pdf?token=2'));
    expect(api.getViewUrl).toHaveBeenCalledTimes(2);
  });

  it('offers the system share sheet (the screen-reader path to the document)', async () => {
    await renderWithProviders(<ViewerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share or open in another app' }));
    expect(download.shareDocument).toHaveBeenCalledWith('d1');
  });
});

describe('nextZoom', () => {
  it.each([
    [1, 1, 1.5],
    [1.5, 1, 2],
    [3.2, 1, 4],
    [4, 1, 4],
    [4, -1, 3],
    [1.2, -1, 1],
    [1, -1, 1],
  ] as const)('%s %s → %s', (from, dir, to) => {
    expect(nextZoom(from, dir)).toBe(to);
  });
});
