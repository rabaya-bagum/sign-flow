import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import * as documentsApi from '@/features/documents/api';
import type { PdfSurfaceProps } from '@/features/viewer';
import { renderWithProviders } from '@/test/render';

import * as editorApi from '../api';
import { FieldEditorScreen } from '../FieldEditorScreen';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));
jest.mock('@/features/documents/api', () => ({
  getDocument: jest.fn(),
  getRecipients: jest.fn(),
  getViewUrl: jest.fn(async () => ({ url: 'https://p.test/d1.pdf?token=t' })),
}));
jest.mock('@/features/documents/download', () => ({ toAppUrl: (u: string) => u }));
jest.mock('../api', () => ({
  fetchFields: jest.fn(),
  saveFields: jest.fn(async () => undefined),
  addRecipient: jest.fn(async () => 'r-new'),
  updateRecipient: jest.fn(async () => undefined),
  deleteRecipient: jest.fn(async () => undefined),
}));
const mockSurface = { props: null as PdfSurfaceProps | null };
jest.mock('@/features/viewer', () => ({
  PdfSurface: (props: PdfSurfaceProps) => {
    mockSurface.props = props;
    return null;
  },
}));

const docs = jest.mocked(documentsApi);
const api = jest.mocked(editorApi);
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const recipient = (id: string, name: string, order: number) => ({
  id,
  name,
  email: null,
  role: 'signer' as const,
  signingOrder: order,
  status: 'pending' as const,
  userId: null,
  lastActionAt: null,
});
const pages = [
  { page: 1, width_pt: 600, height_pt: 800, box_x_pt: 0, box_y_pt: 0, rotation: 0 as const },
  { page: 2, width_pt: 800, height_pt: 600, box_x_pt: 0, box_y_pt: 0, rotation: 90 as const },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
  mockSurface.props = null;
  useAuthStore.setState({
    status: 'signedIn',
    session: { user: { id: 'owner' } } as never,
    recovering: false,
  });
  docs.getDocument.mockResolvedValue({
    id: 'd1',
    title: 'Lease.pdf',
    status: 'draft',
    isOwner: true,
  } as never);
  docs.getRecipients.mockResolvedValue([recipient(R1, 'Signer 1', 1), recipient(R2, 'Aaliyah', 2)]);
  api.fetchFields.mockResolvedValue([]);
});

async function openEditor() {
  await renderWithProviders(<FieldEditorScreen />);
  await waitFor(() => expect(mockSurface.props?.url).toBe('https://p.test/d1.pdf?token=t'));
  await act(async () => mockSurface.props!.onLoaded!({ pageCount: 2, pages }));
}

describe('FieldEditorScreen', () => {
  it('places a field for the active recipient where the page is tapped, then autosaves', async () => {
    await openEditor();
    await fireEvent.press(screen.getByTestId('recipient-chip-1')); // Aaliyah
    await fireEvent.press(screen.getByTestId('tool-signature'));
    expect(screen.getByText('Tap the page to place a Signature field for Aaliyah.')).toBeOnTheScreen();
    await act(async () => mockSurface.props!.onTap!({ page: 1, x: 0.5, y: 0.5 }));

    const overlay = mockSurface.props!.overlays![0]!;
    // 150 × 42 pt centred on the tap, on a 600 × 800 pt page.
    expect(overlay).toMatchObject({ page: 1, editable: true, text: 'Signature', color: '#C2410C' });
    expect(overlay.rect.x).toBeCloseTo(0.375);
    expect(overlay.rect.width).toBeCloseTo(0.25);
    expect(overlay.rect.height).toBeCloseTo(42 / 800);
    expect(overlay.minWidth).toBeCloseTo(60 / 600);
    expect(mockSurface.props!.highlightId).toBe(overlay.id);

    await waitFor(() => expect(api.saveFields).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const saved = api.saveFields.mock.calls[0]![1];
    expect(saved).toEqual([
      expect.objectContaining({ recipient_id: R2, type: 'signature', page_number: 1, required: true }),
    ]);
    expect(await screen.findByText('Saved')).toBeOnTheScreen();
  });

  it('moves fields dragged in the surface and saves the new position', async () => {
    api.fetchFields.mockResolvedValue([
      {
        id: 'f1',
        recipient_id: R1,
        page_number: 2,
        type: 'text',
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.04,
        required: true,
        properties: { fontSize: 12, align: 'left', validation: 'none' },
      },
    ]);
    await openEditor();
    expect(mockSurface.props!.overlays).toHaveLength(1);
    expect(api.saveFields).not.toHaveBeenCalled(); // loading is not a change
    await act(async () =>
      mockSurface.props!.onOverlayChanged!({
        id: 'f1',
        page: 2,
        rect: { x: 0.5, y: 0.6, width: 0.3, height: 0.05 },
      }),
    );
    await waitFor(() => expect(api.saveFields).toHaveBeenCalled(), { timeout: 3000 });
    expect(api.saveFields.mock.calls[0]![1][0]).toMatchObject({
      id: 'f1',
      x: 0.5,
      y: 0.6,
      width: 0.3,
      height: 0.05,
    });
  });

  it('selects, edits properties, duplicates, deletes and undoes', async () => {
    api.fetchFields.mockResolvedValue([
      {
        id: 'f1',
        recipient_id: R1,
        page_number: 1,
        type: 'text',
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.04,
        required: true,
        properties: { fontSize: 12, align: 'left', validation: 'none' },
      },
    ]);
    await openEditor();
    await act(async () => mockSurface.props!.onOverlayTap!('f1'));
    expect(screen.getByText(/Selected: Text for Signer 1, page 1/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('field-properties-open'));
    const sheet = screen.getByTestId('field-properties');
    await fireEvent.press(within(sheet).getByTestId('prop-font-size-16'));
    await fireEvent.press(within(sheet).getByRole('checkbox', { name: 'Required' }));
    await fireEvent.press(within(sheet).getByTestId('prop-recipient-' + R2));
    await fireEvent.press(within(sheet).getByRole('button', { name: 'Move right' }));
    await fireEvent.press(within(sheet).getByRole('button', { name: 'Done' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Duplicate' }));
    expect(mockSurface.props!.overlays).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(mockSurface.props!.overlays).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(mockSurface.props!.overlays).toHaveLength(2);

    await waitFor(() => expect(api.saveFields).toHaveBeenCalled(), { timeout: 3000 });
    const last = api.saveFields.mock.calls.at(-1)![1];
    expect(last[0]).toMatchObject({
      id: 'f1',
      recipient_id: R2,
      required: false,
      properties: { fontSize: 16 },
    });
    expect(last[0]!.x).toBeCloseTo(0.105);
  });

  it('creates a placeholder "Signer 1" when the draft has no recipients', async () => {
    docs.getRecipients.mockResolvedValueOnce([]).mockResolvedValue([recipient(R1, 'Signer 1', 1)]);
    await openEditor();
    await waitFor(() =>
      expect(api.addRecipient).toHaveBeenCalledWith('d1', { name: 'Signer 1', email: null }, 1),
    );
    expect(await screen.findByTestId('recipient-chip-0')).toBeOnTheScreen();
  });

  it('adds a recipient with an optional email', async () => {
    await openEditor();
    await fireEvent.press(screen.getByTestId('recipient-add'));
    expect(screen.getByTestId('recipient-name').props.value).toBe('Signer 3');
    await fireEvent.changeText(screen.getByTestId('recipient-email'), 'Sam@Example.com');
    await fireEvent.press(screen.getByTestId('recipient-save'));
    await waitFor(() =>
      expect(api.addRecipient).toHaveBeenCalledWith('d1', { name: 'Signer 3', email: 'sam@example.com' }, 3),
    );
  });

  it('places with the accessible "middle of the page" button', async () => {
    await openEditor();
    await act(async () => mockSurface.props!.onPageChanged!(2, 2));
    await fireEvent.press(screen.getByTestId('tool-checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: 'Place in the middle of page 2' }));
    expect(mockSurface.props!.overlays![0]).toMatchObject({ page: 2 });
  });

  it('is read-only once the document has been sent', async () => {
    docs.getDocument.mockResolvedValue({
      id: 'd1',
      title: 'Lease.pdf',
      status: 'in_progress',
      isOwner: true,
    } as never);
    await openEditor();
    expect(
      screen.getByText("This document has been sent, so its fields can't be changed."),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('field-toolbar')).toBeNull();
  });

  it('saves before moving on with Next', async () => {
    const { router } = jest.requireMock<{ router: { replace: jest.Mock } }>('expo-router');
    await openEditor();
    await fireEvent.press(screen.getByTestId('tool-text'));
    await act(async () => mockSurface.props!.onTap!({ page: 1, x: 0.3, y: 0.3 }));
    await fireEvent.press(screen.getByTestId('editor-next'));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/documents/[id]', params: { id: 'd1' } }),
    );
    expect(api.saveFields).toHaveBeenCalled();
  });
});
