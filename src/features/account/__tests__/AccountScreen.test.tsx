import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import { AccountScreen } from '../AccountScreen';
import * as accountApi from '../api';
import * as authApi from '@/features/auth/api';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api', () => ({
  fetchProfile: jest.fn(),
  updateProfile: jest.fn(),
  updateThemePreference: jest.fn(),
}));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn() }));
jest.mock('@/lib/openLink', () => ({ openLink: jest.fn() }));
jest.mock('@/features/documents/api', () => ({
  getStorageUsage: jest.fn(async () => ({ bytes: 4436650, documentCount: 6 })),
}));

const profile: accountApi.Profile = {
  id: 'u1',
  full_name: 'John Doe',
  email: 'owner@signflow.test',
  phone: null,
  avatar_path: null,
  theme: 'system',
  locale: 'en',
  notification_prefs: {},
  default_expiry_days: 30,
  default_reminder: {},
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
  jest.mocked(accountApi.fetchProfile).mockResolvedValue(profile);
});

describe('AccountScreen', () => {
  it('shows the profile and labels later-phase settings', async () => {
    await renderWithProviders(<AccountScreen />);
    expect(await screen.findByText('John Doe')).toBeOnTheScreen();
    expect(screen.getByText('owner@signflow.test')).toBeOnTheScreen();
    expect(screen.getAllByText('Coming in Phase 8').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Theme, System' })).toBeOnTheScreen();
    expect(await screen.findByLabelText('Used storage, 4.2 MB · 6 documents')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeOnTheScreen();
  });

  it('asks for confirmation before logging out', async () => {
    jest.mocked(authApi.signOut).mockResolvedValue(undefined);
    await renderWithProviders(<AccountScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    expect(authApi.signOut).not.toHaveBeenCalled();
    expect(screen.getByText('Log out of SignFlow?')).toBeOnTheScreen();
    const buttons = screen.getAllByRole('button', { name: 'Log out' });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(authApi.signOut).toHaveBeenCalledTimes(1));
  });
});
