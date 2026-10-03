import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as api from '@/features/documents/api';
import { renderWithProviders } from '@/test/render';

import { SearchScreen } from '../SearchScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/documents/api', () => ({ searchDocuments: jest.fn() }));
const mockSearch = jest.mocked(api.searchDocuments);

async function type(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Search'), text);
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
}

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('waits for 2 characters, then searches and shows the matched recipient', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'd1',
        title: 'Mutual NDA.pdf',
        displayStatus: 'waiting',
        updatedAt: '2026-10-02T10:00:00Z',
        matchedRecipientName: 'Aaliyah Fatimah',
        matchedRecipientEmail: 'recipient@signflow.test',
      },
    ]);
    await renderWithProviders(<SearchScreen />);
    await type('a');
    expect(screen.getByText('Type at least 2 characters.')).toBeOnTheScreen();
    expect(mockSearch).not.toHaveBeenCalled();
    await type('aal');
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('aal'));
    expect(await screen.findByText('Recipient: Aaliyah Fatimah · recipient@signflow.test')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('search-result-d1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/documents/[id]', params: { id: 'd1' } });
  });

  it('shows the empty-state copy', async () => {
    mockSearch.mockResolvedValue([]);
    await renderWithProviders(<SearchScreen />);
    await type('zzz');
    expect(await screen.findByText('No documents match your search.')).toBeOnTheScreen();
  });
});
