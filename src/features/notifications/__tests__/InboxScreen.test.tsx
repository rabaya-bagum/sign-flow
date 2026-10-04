import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { InboxScreen } from '../InboxScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listNotifications: jest.fn(),
  markRead: jest.fn(async () => undefined),
}));
const mockApi = jest.mocked(api);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
});

it('shows unread notices, marks one read when opened and opens its document', async () => {
  mockApi.listNotifications.mockResolvedValue([
    {
      id: 'n1',
      documentId: 'd1',
      type: 'signed',
      title: 'Bea signed',
      body: 'Lease.pdf',
      readAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'n2',
      documentId: 'd2',
      type: 'completed',
      title: 'Everyone has signed',
      body: 'NDA.pdf',
      readAt: '2026-10-01T00:00:00Z',
      createdAt: new Date().toISOString(),
    },
  ]);
  await renderWithProviders(<InboxScreen />);
  const first = await screen.findByTestId('inbox-item-0');
  expect(first.props.accessibilityLabel).toMatch(/Bea signed, Lease.pdf, .*unread$/);
  expect(screen.getByTestId('inbox-item-1').props.accessibilityLabel).not.toMatch(/unread/);
  await fireEvent.press(first);
  await waitFor(() => expect(mockApi.markRead).toHaveBeenCalledWith(['n1']));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/documents/[id]', params: { id: 'd1' } });
  await fireEvent.press(screen.getByTestId('inbox-mark-all'));
  await waitFor(() => expect(mockApi.markRead).toHaveBeenLastCalledWith(undefined));
});

it('empty inbox', async () => {
  mockApi.listNotifications.mockResolvedValue([]);
  await renderWithProviders(<InboxScreen />);
  expect(await screen.findByText('No notifications yet.')).toBeOnTheScreen();
  expect(screen.queryByTestId('inbox-mark-all')).toBeNull();
});
