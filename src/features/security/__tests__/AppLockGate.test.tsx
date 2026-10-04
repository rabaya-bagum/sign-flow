import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@/test/render';

import * as appLock from '../appLock';
import { AppLockGate } from '../AppLockGate';

jest.mock('@/features/auth/api', () => ({ signOut: jest.fn(async () => undefined) }));
jest.mock('../appLock', () => ({
  ...jest.requireActual('../appLock'),
  authenticate: jest.fn(async () => false),
}));
const mockAuthenticate = jest.mocked(appLock.authenticate);

it('stays open when biometric unlock is off', async () => {
  appLock.useAppLockStore.setState({ enabled: false });
  await renderWithProviders(
    <AppLockGate>
      <Text>Home</Text>
    </AppLockGate>,
  );
  expect(screen.queryByTestId('app-lock')).toBeNull();
  expect(mockAuthenticate).not.toHaveBeenCalled();
});

it('locks at launch when on, and opens after a successful check', async () => {
  appLock.useAppLockStore.setState({ enabled: true });
  await renderWithProviders(
    <AppLockGate>
      <Text>Home</Text>
    </AppLockGate>,
  );
  expect(screen.getByTestId('app-lock')).toBeOnTheScreen();
  await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
  mockAuthenticate.mockResolvedValueOnce(true);
  await fireEvent.press(screen.getByTestId('app-lock-unlock'));
  await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
});
