import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppError } from '@shared/errors';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { DocumentDetailsScreen } from '../DocumentDetailsScreen';
import * as download from '../download';
import type { DocumentDetail } from '../types';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(() => ({ id: 'd1' })),
  Stack: { Screen: () => null },
}));
jest.mock('../api', () => ({
  getDocument: jest.fn(),
  getRecipients: jest.fn(),
  markOpened: jest.fn(async () => undefined),
  deleteDraft: jest.fn(),
  setHidden: jest.fn(),
  renameDocument: jest.fn(),
}));
jest.mock('../download', () => ({
  canSaveToDevice: false,
  shareDocument: jest.fn(async () => undefined),
  saveToDevice: jest.fn(),
}));

const mockApi = jest.mocked(api);

const sent: DocumentDetail = {
  id: 'd1',
  title: 'Mutual NDA.pdf',
  displayStatus: 'needs_signature',
  status: 'in_progress',
  ownerId: 'owner-1',
  ownerName: 'John Doe',
  isOwner: true,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T10:00:00Z',
  sentAt: '2026-10-02T10:00:00Z',
  completedAt: null,
  voidedAt: null,
  voidReason: null,
  fileSizeBytes: 245760,
  pageCount: 3,
  uploadIncomplete: false,
  hidden: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'd1' });
  useAuthStore.setState({
    status: 'signedIn',
    session: { user: { id: 'owner-1' } } as never,
    recovering: false,
  });
  mockApi.getDocument.mockResolvedValue(sent);
  mockApi.getRecipients.mockResolvedValue([
    {
      id: 'r1',
      name: 'John Doe',
      email: 'owner@signflow.test',
      role: 'signer',
      signingOrder: 1,
      status: 'sent',
      userId: 'owner-1',
      lastActionAt: '2026-10-02T10:00:00Z',
    },
    {
      id: 'r2',
      name: 'Aaliyah Fatimah',
      email: 'recipient@signflow.test',
      role: 'signer',
      signingOrder: 2,
      status: 'pending',
      userId: 'u2',
      lastActionAt: null,
    },
  ]);
});

describe('DocumentDetailsScreen', () => {
  it('shows the status banner, info and recipients, and records the open', async () => {
    await renderWithProviders(<DocumentDetailsScreen />);
    expect(await screen.findByText("It's your turn to sign.")).toBeOnTheScreen();
    expect(screen.getByLabelText('Pages, 3')).toBeOnTheScreen();
    expect(screen.getByText('240 KB')).toBeOnTheScreen();
    // Once as the sender, once as a recipient.
    expect(await screen.findAllByText('John Doe (You)')).toHaveLength(2);
    expect(screen.getByText('Aaliyah Fatimah')).toBeOnTheScreen();
    expect(screen.getByText('Pending')).toBeOnTheScreen();
    await waitFor(() => expect(mockApi.markOpened).toHaveBeenCalledWith('d1'));
  });

  it('offers share and remove-from-library for sent documents (no delete or rename)', async () => {
    await renderWithProviders(<DocumentDetailsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Share' }));
    expect(download.shareDocument).toHaveBeenCalledWith('d1');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove from my library' })).toBeOnTheScreen();
  });

  it('offers retry, rename and delete for an incomplete draft, then goes back after deleting', async () => {
    mockApi.getDocument.mockResolvedValue({
      ...sent,
      status: 'draft',
      displayStatus: 'draft',
      uploadIncomplete: true,
      fileSizeBytes: null,
      pageCount: null,
    });
    mockApi.getRecipients.mockResolvedValue([]);
    mockApi.deleteDraft.mockResolvedValue({ document_id: 'd1', deleted: true });
    await renderWithProviders(<DocumentDetailsScreen />);
    expect(
      await screen.findByText('This draft has no file yet. Retry the upload to continue.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry upload' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/documents/new/source',
      params: { documentId: 'd1' },
    });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' }).pop()!);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('explains when a hidden document is still reachable and can be restored', async () => {
    mockApi.getDocument.mockResolvedValue({ ...sent, hidden: true });
    mockApi.setHidden.mockResolvedValue(undefined);
    await renderWithProviders(<DocumentDetailsScreen />);
    expect(await screen.findByText('Removed from your library. It stays available here.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Show in my library' }));
    await waitFor(() => expect(mockApi.setHidden).toHaveBeenCalledWith('d1', false));
  });

  it('shows a not-found state without revealing anything else', async () => {
    mockApi.getDocument.mockRejectedValue(new AppError('NOT_FOUND'));
    await renderWithProviders(<DocumentDetailsScreen />);
    expect(await screen.findByText(/isn't available/)).toBeOnTheScreen();
  });
});
