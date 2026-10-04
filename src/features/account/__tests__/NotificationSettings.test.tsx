import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import * as notificationsApi from '@/features/notifications/api';
import { renderWithProviders } from '@/test/render';

import * as accountApi from '../api';
import { DefaultSigningScreen } from '../DefaultSigningScreen';
import { NotificationPrefsScreen } from '../NotificationPrefsScreen';

jest.mock('@/features/notifications/api', () => ({
  ...jest.requireActual('@/features/notifications/api'),
  fetchNotificationPrefs: jest.fn(),
  saveNotificationPrefs: jest.fn(async () => undefined),
}));
jest.mock('@/features/notifications/push', () => ({
  pushStatus: jest.fn(async () => 'unavailable'),
  enablePush: jest.fn(async () => 'unavailable'),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchProfile: jest.fn(),
  updateSigningDefaults: jest.fn(),
}));
const prefsApi = jest.mocked(notificationsApi);
const mockAccount = jest.mocked(accountApi);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
});

it('notification settings: channels and topics save the whole preference object', async () => {
  prefsApi.fetchNotificationPrefs.mockResolvedValue({
    email: true,
    push: true,
    topics: { requests: true, reminders: true, completed: true, activity: true },
  });
  await renderWithProviders(<NotificationPrefsScreen />);
  await fireEvent(await screen.findByTestId('prefs-email'), 'valueChange', false);
  await waitFor(() =>
    expect(prefsApi.saveNotificationPrefs).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ email: false }),
    ),
  );
  await fireEvent(screen.getByTestId('prefs-topic-activity'), 'valueChange', false);
  await waitFor(() =>
    expect(prefsApi.saveNotificationPrefs).toHaveBeenLastCalledWith('u1', {
      email: false,
      push: true,
      topics: { requests: true, reminders: true, completed: true, activity: false },
    }),
  );
  // Push can't be turned on where it isn't available (web, simulators, builds without a project ID).
  expect(screen.getByTestId('prefs-push').props.disabled).toBe(true);
});

it('default signing settings save expiry and reminder interval', async () => {
  const profile = {
    id: 'u1',
    default_expiry_days: 30,
    default_reminder: { first_after_days: 3, repeat_every_days: 3 },
  };
  mockAccount.fetchProfile.mockResolvedValue(profile as never);
  mockAccount.updateSigningDefaults.mockImplementation(
    async (_id, v) => ({ ...profile, default_expiry_days: v.expiryDays }) as never,
  );
  await renderWithProviders(<DefaultSigningScreen />);
  await fireEvent.press(await screen.findByTestId('default-expiry-14'));
  await waitFor(() =>
    expect(mockAccount.updateSigningDefaults).toHaveBeenCalledWith('u1', { expiryDays: 14, reminderDays: 3 }),
  );
  await fireEvent.press(screen.getByTestId('default-reminders-0'));
  await waitFor(() =>
    expect(mockAccount.updateSigningDefaults).toHaveBeenLastCalledWith('u1', {
      expiryDays: 14,
      reminderDays: null,
    }),
  );
});
