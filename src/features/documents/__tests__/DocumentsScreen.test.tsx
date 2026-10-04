import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { DocumentsScreen } from '../DocumentsScreen';
import type { DocumentListItem } from '../types';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('../api', () => ({
  listDocuments: jest.fn(),
  listSenders: jest.fn(async () => [{ id: 'owner-1', fullName: 'John Doe' }]),
  deleteDraft: jest.fn(),
  setHidden: jest.fn(),
  renameDocument: jest.fn(),
}));
jest.mock('../download', () => ({
  canSaveToDevice: false,
  shareDocument: jest.fn(),
  saveToDevice: jest.fn(),
}));

const mockApi = jest.mocked(api);

function item(overrides: Partial<DocumentListItem>): DocumentListItem {
  return {
    id: 'd1',
    title: 'Mutual NDA.pdf',
    displayStatus: 'needs_signature',
    status: 'in_progress',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: new Date().toISOString(),
    fileSizeBytes: 245760,
    pageCount: 3,
    ownerId: 'owner-1',
    ownerName: 'John Doe',
    participants: [
      { name: 'John Doe', email: 'owner@signflow.test' },
      { name: 'Aaliyah Fatimah', email: 'recipient@signflow.test' },
    ],
    participantCount: 2,
    signersTotal: 2,
    signersCompleted: 0,
    uploadIncomplete: false,
    cursorValue: 'c1',
    ...overrides,
  };
}

const draft = item({
  id: 'd3',
  title: 'Consulting Contract.pdf',
  displayStatus: 'draft',
  status: 'draft',
  participants: [],
  participantCount: 0,
  signersTotal: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useAuthStore.setState({
    status: 'signedIn',
    session: { user: { id: 'owner-1' } } as never,
    recovering: false,
  });
  mockApi.listDocuments.mockResolvedValue({ items: [item({}), draft], nextCursor: null });
});

const lastParams = () => mockApi.listDocuments.mock.calls[mockApi.listDocuments.mock.calls.length - 1]![0];

describe('DocumentsScreen', () => {
  it('lists documents with status, progress, size and participants', async () => {
    await renderWithProviders(<DocumentsScreen />);
    expect(await screen.findByText('Mutual NDA.pdf')).toBeOnTheScreen();
    expect(screen.getByText('0 of 2 signed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Participants: John Doe, Aaliyah Fatimah')).toBeOnTheScreen();
    expect(screen.getAllByText(/240 KB/)).toHaveLength(2);
    expect(lastParams()).toEqual(expect.objectContaining({ bucket: 'all', sort: 'newest', search: '' }));
  });

  it('opens with the bucket passed from Home and switches buckets', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ bucket: 'waiting' });
    await renderWithProviders(<DocumentsScreen />);
    await screen.findByText('Mutual NDA.pdf');
    expect(lastParams().bucket).toBe('waiting');
    expect(screen.getByRole('radio', { name: 'Waiting' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Closed' }));
    await waitFor(() => expect(lastParams().bucket).toBe('closed'));
  });

  it('debounces search', async () => {
    jest.useFakeTimers();
    await renderWithProviders(<DocumentsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search documents'), 'nda');
    expect(lastParams().search).toBe('');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    await waitFor(() => expect(lastParams().search).toBe('nda'));
    jest.useRealTimers();
  });

  it('applies sort and filters and shows the active filter count', async () => {
    await renderWithProviders(<DocumentsScreen />);
    await screen.findByText('Mutual NDA.pdf');
    await fireEvent.press(screen.getByRole('button', { name: 'Newest first' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Title (A–Z)' }));
    await waitFor(() => expect(lastParams().sort).toBe('title'));

    await fireEvent.press(screen.getByRole('button', { name: 'Filter' }));
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Last 30 days' })[0]!);
    await fireEvent.press(await screen.findByRole('radio', { name: 'John Doe' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Show results' }));
    await waitFor(() =>
      expect(lastParams().filters).toEqual({
        created: '30d',
        modified: 'any',
        senderId: 'owner-1',
        recipient: '',
      }),
    );
    expect(screen.getByRole('button', { name: 'Filter, 2 active' })).toBeOnTheScreen();
  });

  it('shows the bucket-specific empty state', async () => {
    mockApi.listDocuments.mockResolvedValue({ items: [], nextCursor: null });
    jest.mocked(useLocalSearchParams).mockReturnValue({ bucket: 'needs_signature' });
    await renderWithProviders(<DocumentsScreen />);
    expect(
      await screen.findByText("You're all caught up. No documents need your signature."),
    ).toBeOnTheScreen();
  });

  it('offers draft actions and deletes after confirmation', async () => {
    mockApi.deleteDraft.mockResolvedValue({ document_id: 'd3', deleted: true });
    await renderWithProviders(<DocumentsScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'More actions for Consulting Contract.pdf' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem', { name: 'Remove from my library' })).toBeNull();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete this draft?')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Delete' }).pop()!);
    await waitFor(() => expect(mockApi.deleteDraft).toHaveBeenCalledWith('d3'));
  });

  it('offers "Remove from my library" (not delete) for sent documents', async () => {
    mockApi.setHidden.mockResolvedValue(undefined);
    await renderWithProviders(<DocumentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More actions for Mutual NDA.pdf' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Remove from my library' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockApi.setHidden).toHaveBeenCalledWith('d1', true));
  });

  it('opens details when a card is pressed', async () => {
    await renderWithProviders(<DocumentsScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: /^Mutual NDA\.pdf, Needs your signature/ }),
    );
    expect(router.push).toHaveBeenCalledWith({ pathname: '/documents/[id]', params: { id: 'd1' } });
  });
});
