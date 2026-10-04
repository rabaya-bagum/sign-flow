import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AppError } from '@shared/errors';

import * as mfa from '@/features/auth/mfa';
import { TwoFactorChallengeScreen } from '@/features/auth/screens/TwoFactorChallengeScreen';
import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import * as appLock from '../appLock';
import { ChangePasswordScreen } from '../ChangePasswordScreen';
import { DeleteAccountScreen } from '../DeleteAccountScreen';
import { SecurityScreen } from '../SecurityScreen';
import { TwoFactorSetupScreen } from '../TwoFactorSetupScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock('@/features/auth/mfa', () => ({
  listTotpFactors: jest.fn(async () => []),
  enrollTotp: jest.fn(),
  verifyTotp: jest.fn(async () => undefined),
  removeTotp: jest.fn(async () => undefined),
  passSecondFactor: jest.fn(async () => undefined),
}));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn(async () => undefined) }));
jest.mock('@/features/auth/socialAuth', () => ({
  signInWithApple: jest.fn(async () => undefined),
  signInWithGoogle: jest.fn(async () => undefined),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  changePassword: jest.fn(async () => undefined),
  requestReauthCode: jest.fn(async () => undefined),
  signOutOtherDevices: jest.fn(async () => undefined),
  deleteAccount: jest.fn(async () => undefined),
}));
jest.mock('../appLock', () => ({
  ...jest.requireActual('../appLock'),
  biometricAvailability: jest.fn(async () => 'available'),
  authenticate: jest.fn(async () => true),
}));
jest.mock('expo-image', () => ({ Image: () => null }));

const mockApi = jest.mocked(api);
const mockMfa = jest.mocked(mfa);
const mockLock = jest.mocked(appLock);

const signedIn = (providers: string[]) =>
  useAuthStore.setState({
    status: 'signedIn',
    recovering: false,
    session: {
      user: { id: 'u1', identities: providers.map((provider) => ({ provider })) },
    } as unknown as Session,
  });

beforeEach(() => {
  jest.clearAllMocks();
  appLock.useAppLockStore.setState({ enabled: false });
  signedIn(['email']);
});

describe('TwoFactorChallengeScreen', () => {
  it('verifies a 6-digit code and clears a wrong one', async () => {
    await renderWithProviders(<TwoFactorChallengeScreen />);
    expect(screen.getByTestId('two-factor-verify')).toBeDisabled();
    mockMfa.passSecondFactor.mockRejectedValueOnce(new AppError('OTP_INVALID'));
    await fireEvent.changeText(screen.getByTestId('two-factor-code'), '12 34 56');
    await fireEvent.press(screen.getByTestId('two-factor-verify'));
    await waitFor(() => expect(mockMfa.passSecondFactor).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText(/That code isn't right/)).toBeOnTheScreen();
    expect(screen.getByTestId('two-factor-code').props.value).toBe('');
  });
});

describe('SecurityScreen', () => {
  it('signs out other devices after confirming', async () => {
    await renderWithProviders(<SecurityScreen />);
    await fireEvent.press(screen.getByTestId('security-other-devices'));
    await fireEvent.press(screen.getByText('Sign out others'));
    await waitFor(() => expect(mockApi.signOutOtherDevices).toHaveBeenCalled());
    expect(await screen.findByText('Other devices have been signed out.')).toBeOnTheScreen();
  });

  it('turns biometric unlock on only after a successful check', async () => {
    await renderWithProviders(<SecurityScreen />);
    const toggle = await screen.findByTestId('security-biometrics');
    await waitFor(() => expect(toggle).not.toBeDisabled());
    mockLock.authenticate.mockResolvedValueOnce(false);
    await fireEvent(toggle, 'valueChange', true);
    expect(appLock.useAppLockStore.getState().enabled).toBe(false);
    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(appLock.useAppLockStore.getState().enabled).toBe(true));
  });

  it('hides Change password for accounts without one', async () => {
    signedIn(['apple']);
    await renderWithProviders(<SecurityScreen />);
    expect(screen.queryByTestId('security-password')).toBeNull();
    expect(screen.getByTestId('security-two-factor')).toBeOnTheScreen();
  });
});

describe('ChangePasswordScreen', () => {
  it('asks for an emailed code when Supabase wants re-authentication', async () => {
    mockApi.changePassword.mockRejectedValueOnce(new AppError('REAUTH_REQUIRED'));
    await renderWithProviders(<ChangePasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('change-password-new'), 'new-password-42');
    await fireEvent.changeText(screen.getByTestId('change-password-confirm'), 'new-password-42');
    await fireEvent.press(screen.getByTestId('change-password-submit'));
    await waitFor(() => expect(mockApi.requestReauthCode).toHaveBeenCalled());
    await fireEvent.changeText(await screen.findByTestId('change-password-code'), '654321');
    await fireEvent.press(screen.getByTestId('change-password-submit'));
    await waitFor(() => expect(mockApi.changePassword).toHaveBeenLastCalledWith('new-password-42', '654321'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('TwoFactorSetupScreen', () => {
  it('enrolls, shows the key and turns on with a valid code', async () => {
    mockMfa.enrollTotp.mockResolvedValueOnce({
      factorId: 'f1',
      qrCode: 'data:image/svg+xml;utf-8,<svg/>',
      secret: 'ABCDEFGHABCDEFGH',
      uri: 'otpauth://totp/SignFlow:x',
    });
    await renderWithProviders(<TwoFactorSetupScreen />);
    await fireEvent.press(await screen.findByTestId('two-factor-start'));
    expect(await screen.findByText('ABCD EFGH ABCD EFGH')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('two-factor-setup-code'), '111222');
    await fireEvent.press(screen.getByTestId('two-factor-confirm'));
    await waitFor(() => expect(mockMfa.verifyTotp).toHaveBeenCalledWith('f1', '111222'));
    expect(await screen.findByText('Two-factor authentication is on.')).toBeOnTheScreen();
  });

  it('turns off after confirming', async () => {
    mockMfa.listTotpFactors.mockResolvedValue([{ id: 'f9', friendlyName: null, createdAt: '' }]);
    await renderWithProviders(<TwoFactorSetupScreen />);
    await fireEvent.press(await screen.findByTestId('two-factor-off'));
    await fireEvent.press(screen.getAllByText('Turn off').at(-1)!);
    await waitFor(() => expect(mockMfa.removeTotp).toHaveBeenCalledWith('f9'));
    mockMfa.listTotpFactors.mockResolvedValue([]);
  });
});

describe('DeleteAccountScreen', () => {
  it('needs the password, then deletes after a final confirmation', async () => {
    await renderWithProviders(<DeleteAccountScreen />);
    expect(screen.getByText('Your saved signatures and initials', { exact: false })).toBeOnTheScreen();
    expect(screen.getByTestId('delete-account-submit')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('delete-account-password'), 'my-password-1');
    await fireEvent.press(screen.getByTestId('delete-account-submit'));
    await fireEvent.press(screen.getByText('Delete permanently'));
    await waitFor(() => expect(mockApi.deleteAccount).toHaveBeenCalledWith('my-password-1'));
  });

  it('a social account signs in again when the server asks', async () => {
    signedIn(['google']);
    mockApi.deleteAccount.mockRejectedValueOnce(new AppError('REAUTH_REQUIRED'));
    await renderWithProviders(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByTestId('delete-account-submit'));
    await fireEvent.press(screen.getByText('Delete permanently'));
    await fireEvent.press(await screen.findByText('Sign in again with Google'));
    await fireEvent.press(await screen.findByText('Delete permanently'));
    await waitFor(() => expect(mockApi.deleteAccount).toHaveBeenCalledTimes(2));
    expect(mockApi.deleteAccount).toHaveBeenLastCalledWith(undefined);
  });
});
