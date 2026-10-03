import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AppError } from '@shared/errors';

import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { HomeScreen } from '../HomeScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
}));
jest.mock('../api', () => ({ fetchDashboardSummary: jest.fn(), fetchRecentDocuments: jest.fn() }));

const mockApi = jest.mocked(api);
const mockRouter = jest.mocked(router);

const summary = { needsSignature: 1, waiting: 2, drafts: 1, completed: 1 };
const recent: api.RecentDocument[] = [
  {
    id: 'd1',
    title: 'Mutual NDA.pdf',
    displayStatus: 'needs_signature',
    updatedAt: new Date().toISOString(),
    ownerName: 'John Doe',
  },
  {
    id: 'd2',
    title: 'Insurance Form.pdf',
    displayStatus: 'voided',
    updatedAt: '2026-09-01T10:00:00Z',
    ownerName: 'John Doe',
  },
];

beforeEach(() => jest.clearAllMocks());

describe('HomeScreen', () => {
  it('shows summary counts and recent documents', async () => {
    mockApi.fetchDashboardSummary.mockResolvedValue(summary);
    mockApi.fetchRecentDocuments.mockResolvedValue(recent);
    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByRole('button', { name: 'Needs your signature, 1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Waiting for others, 2' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Drafts, 1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Completed, 1' })).toBeOnTheScreen();
    expect(await screen.findByText('Mutual NDA.pdf')).toBeOnTheScreen();
    expect(screen.getByText('Voided')).toBeOnTheScreen();
    expect(mockApi.fetchRecentDocuments).toHaveBeenCalledWith(5);
  });

  it('opens the Documents tab filtered by bucket', async () => {
    mockApi.fetchDashboardSummary.mockResolvedValue(summary);
    mockApi.fetchRecentDocuments.mockResolvedValue([]);
    await renderWithProviders(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Waiting for others, 2' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/documents',
      params: { bucket: 'waiting' },
    });
  });

  it('opens document details from the info button', async () => {
    mockApi.fetchDashboardSummary.mockResolvedValue(summary);
    mockApi.fetchRecentDocuments.mockResolvedValue(recent);
    await renderWithProviders(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Details for Mutual NDA.pdf' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/documents/[id]',
      params: { id: 'd1' },
    });
  });

  it('shows the empty state copy when there are no documents', async () => {
    mockApi.fetchDashboardSummary.mockResolvedValue({
      needsSignature: 0,
      waiting: 0,
      drafts: 0,
      completed: 0,
    });
    mockApi.fetchRecentDocuments.mockResolvedValue([]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText("You haven't uploaded any documents yet.")).toBeOnTheScreen();
  });

  it('shows an error state with retry when loading fails', async () => {
    mockApi.fetchDashboardSummary.mockRejectedValue(new AppError('NETWORK_OFFLINE'));
    mockApi.fetchRecentDocuments.mockRejectedValue(new AppError('NETWORK_OFFLINE'));
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(/You're offline/)).toBeOnTheScreen();

    mockApi.fetchDashboardSummary.mockResolvedValue(summary);
    mockApi.fetchRecentDocuments.mockResolvedValue(recent);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Mutual NDA.pdf')).toBeOnTheScreen();
  });

  it('routes header actions and the upload CTA to their placeholders', async () => {
    mockApi.fetchDashboardSummary.mockResolvedValue(summary);
    mockApi.fetchRecentDocuments.mockResolvedValue([]);
    await renderWithProviders(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Upload document' }));
    expect(mockRouter.push.mock.calls.map((c) => c[0])).toEqual([
      '/search',
      '/notifications',
      '/documents/new/source',
    ]);
  });

  it('renders in dark mode', async () => {
    mockApi.fetchDashboardSummary.mockResolvedValue(summary);
    mockApi.fetchRecentDocuments.mockResolvedValue(recent);
    await renderWithProviders(<HomeScreen />, { scheme: 'dark' });
    expect(await screen.findByText('Mutual NDA.pdf')).toBeOnTheScreen();
  });
});
