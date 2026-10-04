import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { DocumentDetailsScreen } from '../DocumentDetailsScreen';
import type { DocumentDetail, Recipient } from '../types';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: { Screen: () => null },
}));
jest.mock('../api', () => ({
  getDocument: jest.fn(),
  getRecipients: jest.fn(),
  markOpened: jest.fn(async () => undefined),
  getViewUrl: jest.fn(async () => ({ url: 'https://x.test/a.pdf' })),
  remindRecipients: jest.fn(async () => ({ reminded: 1, skipped: [] })),
  voidDocument: jest.fn(async () => ({ status: 'voided' })),
}));
jest.mock('@/features/viewer', () => ({ PdfSurface: () => null }));
jest.mock('../download', () => ({
  toAppUrl: (u: string) => u,
  canSaveToDevice: false,
  shareDocument: jest.fn(),
}));
jest.mock('@/features/activity/api', () => ({
  documentTimeline: jest.fn(async () =>
    Array.from({ length: 7 }, (_, i) => ({
      id: 100 - i,
      documentId: 'd1',
      documentTitle: '',
      type: i === 0 ? 'REMINDER_SENT' : 'DOCUMENT_VIEWED',
      description: i === 0 ? 'Reminder sent to Bea' : `Viewed ${i}`,
      actorName: 'Ann Owner',
      createdAt: new Date(Date.now() - i * 60_000).toISOString(),
    })),
  ),
}));

const mockApi = jest.mocked(api);
const doc: DocumentDetail = {
  id: 'd1',
  title: 'Lease.pdf',
  displayStatus: 'waiting',
  status: 'in_progress',
  ownerId: 'owner-1',
  ownerName: 'Ann Owner',
  isOwner: true,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T10:00:00Z',
  sentAt: '2026-10-02T10:00:00Z',
  completedAt: null,
  voidedAt: null,
  voidReason: null,
  fileSizeBytes: 1000,
  pageCount: 1,
  uploadIncomplete: false,
  hidden: false,
};
const recipient = (
  id: string,
  name: string,
  status: Recipient['status'],
  role: Recipient['role'] = 'signer',
): Recipient => ({
  id,
  name,
  email: `${name.toLowerCase()}@x.test`,
  role,
  signingOrder: 1,
  status,
  userId: null,
  lastActionAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    status: 'signedIn',
    session: { user: { id: 'owner-1' } } as never,
    recovering: false,
  });
  mockApi.getDocument.mockResolvedValue(doc);
  mockApi.getRecipients.mockResolvedValue([
    recipient('r1', 'Bea', 'sent'),
    recipient('r2', 'Cal', 'signed'),
    recipient('r3', 'Cora', 'pending', 'cc'),
  ]);
});

it('reminds one waiting recipient from their row, or everyone', async () => {
  await renderWithProviders(<DocumentDetailsScreen />);
  await fireEvent.press(await screen.findByTestId('recipient-r1'));
  await fireEvent.press(screen.getByText('Remind Bea'));
  await waitFor(() => expect(mockApi.remindRecipients).toHaveBeenCalledWith('d1', 'r1'));
  expect(await screen.findByText('Reminder sent.')).toBeOnTheScreen();

  // Signed and CC rows have no actions.
  await fireEvent.press(screen.getByTestId('recipient-r2'));
  expect(screen.queryByText('Remind Cal')).toBeNull();

  mockApi.remindRecipients.mockResolvedValueOnce({ reminded: 0, skipped: ['r1'] });
  await fireEvent.press(screen.getByTestId('details-remind-all'));
  await waitFor(() => expect(mockApi.remindRecipients).toHaveBeenLastCalledWith('d1', undefined));
  expect(await screen.findByText(/were skipped/)).toBeOnTheScreen();
});

it('voids with a required reason', async () => {
  await renderWithProviders(<DocumentDetailsScreen />);
  await fireEvent.press(await screen.findByTestId('details-void'));
  expect(screen.getByTestId('void-confirm')).toBeDisabled();
  await fireEvent.changeText(screen.getByTestId('void-reason'), 'Wrong version');
  await fireEvent.press(screen.getByTestId('void-confirm'));
  await waitFor(() => expect(mockApi.voidDocument).toHaveBeenCalledWith('d1', 'Wrong version'));
  expect(await screen.findByText('Document voided.')).toBeOnTheScreen();
});

it('shows the activity timeline, collapsed to the latest five', async () => {
  await renderWithProviders(<DocumentDetailsScreen />);
  expect(await screen.findByText('Reminder sent to Bea')).toBeOnTheScreen();
  expect(screen.queryByText('Viewed 6')).toBeNull();
  await fireEvent.press(screen.getByTestId('details-timeline-toggle'));
  expect(screen.getByText('Viewed 6')).toBeOnTheScreen();
});

it('no Remind or Void for a voided document, and the reason is shown', async () => {
  mockApi.getDocument.mockResolvedValue({
    ...doc,
    status: 'voided',
    displayStatus: 'voided',
    voidReason: 'Sent twice',
  });
  await renderWithProviders(<DocumentDetailsScreen />);
  expect(await screen.findByText('Voided: Sent twice')).toBeOnTheScreen();
  expect(screen.queryByTestId('details-void')).toBeNull();
  expect(screen.queryByTestId('details-remind-all')).toBeNull();
});
