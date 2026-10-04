import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { ActivityScreen } from '../ActivityScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api', () => ({ ...jest.requireActual('../api'), listActivity: jest.fn() }));
const mockApi = jest.mocked(api);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
});

it('lists events across documents and opens the document', async () => {
  mockApi.listActivity.mockResolvedValue([
    {
      id: 2,
      documentId: 'd9',
      documentTitle: 'Lease.pdf',
      type: 'DOCUMENT_SIGNED',
      description: 'Bea signed',
      actorName: 'Bea',
      createdAt: new Date().toISOString(),
    },
  ]);
  await renderWithProviders(<ActivityScreen />);
  expect(await screen.findByText('Bea signed')).toBeOnTheScreen();
  expect(screen.getByText('Lease.pdf')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('activity-2'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/documents/[id]', params: { id: 'd9' } });
});

it('filters by kind and shows empty states', async () => {
  mockApi.listActivity.mockResolvedValue([]);
  await renderWithProviders(<ActivityScreen />);
  expect(await screen.findByText('Activity on your documents will appear here.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('activity-filter-signatures'));
  await waitFor(() =>
    expect(mockApi.listActivity).toHaveBeenLastCalledWith(
      ['DOCUMENT_SIGNED', 'DOCUMENT_APPROVED'],
      undefined,
    ),
  );
  expect(await screen.findByText('No activity of this kind yet.')).toBeOnTheScreen();
});
