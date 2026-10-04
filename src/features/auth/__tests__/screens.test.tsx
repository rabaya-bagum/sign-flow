import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppError } from '@shared/errors';

import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { AuthCallbackScreen } from '../screens/AuthCallbackScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { useAuthStore } from '../store';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('../api', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  exchangeAuthCode: jest.fn(),
  resendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('@/lib/openLink', () => ({ openLink: jest.fn() }));

const mockApi = jest.mocked(api);
const mockRouter = jest.mocked(router);
const setParams = (params: Record<string, string>) =>
  jest.mocked(useLocalSearchParams).mockReturnValue(params);

beforeEach(() => {
  jest.clearAllMocks();
  setParams({});
  useAuthStore.setState({ status: 'signedOut', session: null, recovering: false });
});

describe('SignInScreen', () => {
  it('shows validation errors and does not call the API for an empty form', async () => {
    await renderWithProviders(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
    expect(mockApi.signInWithEmail).not.toHaveBeenCalled();
  });

  it('signs in with a normalized email', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    await renderWithProviders(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), '  John@Example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'whatever');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(mockApi.signInWithEmail).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'whatever',
      }),
    );
  });

  it('shows friendly copy for invalid credentials', async () => {
    mockApi.signInWithEmail.mockRejectedValue(new AppError('INVALID_CREDENTIALS'));
    await renderWithProviders(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/don't match/);
  });

  it('routes unverified users to the verify screen', async () => {
    mockApi.signInWithEmail.mockRejectedValue(new AppError('EMAIL_NOT_CONFIRMED'));
    await renderWithProviders(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/verify-email',
        params: { email: 'a@b.co' },
      }),
    );
  });
});

describe('SignUpScreen', () => {
  async function fill() {
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Aaliyah Fatimah');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'aaliyah@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correcthorse1');
  }

  it('requires accepting the terms', async () => {
    await renderWithProviders(<SignUpScreen />);
    await fill();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Please accept the Terms and Privacy Policy.')).toBeOnTheScreen();
    expect(mockApi.signUpWithEmail).not.toHaveBeenCalled();
  });

  it('enforces the password policy', async () => {
    await renderWithProviders(<SignUpScreen />);
    await fill();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use at least 10 characters.')).toBeOnTheScreen();
  });

  it('signs up and moves to email verification', async () => {
    mockApi.signUpWithEmail.mockResolvedValue(undefined);
    await renderWithProviders(<SignUpScreen />);
    await fill();
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(mockApi.signUpWithEmail).toHaveBeenCalledWith({
        fullName: 'Aaliyah Fatimah',
        email: 'aaliyah@example.com',
        password: 'correcthorse1',
        acceptTerms: true,
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/verify-email',
      params: { email: 'aaliyah@example.com', sent: '1' },
    });
  });
});

describe('ForgotPasswordScreen', () => {
  it('confirms without revealing whether the account exists', async () => {
    mockApi.sendPasswordResetEmail.mockResolvedValue(undefined);
    await renderWithProviders(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'nobody@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for nobody@example.com/)).toBeOnTheScreen();
  });
});

describe('AuthCallbackScreen', () => {
  it('exchanges a sign-up code and hands off to the index route', async () => {
    setParams({ code: 'abc', flow: 'signup' });
    mockApi.exchangeAuthCode.mockResolvedValue(undefined);
    await renderWithProviders(<AuthCallbackScreen />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockApi.exchangeAuthCode).toHaveBeenCalledWith('abc');
    expect(useAuthStore.getState().recovering).toBe(false);
  });

  it('enters recovery mode before exchanging a recovery code', async () => {
    setParams({ code: 'abc', flow: 'recovery' });
    mockApi.exchangeAuthCode.mockImplementation(async () => {
      expect(useAuthStore.getState().recovering).toBe(true);
    });
    await renderWithProviders(<AuthCallbackScreen />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/reset-password'));
  });

  it('shows an error for expired links without calling the API', async () => {
    setParams({ error: 'access_denied', error_code: 'otp_expired', flow: 'recovery' });
    await renderWithProviders(<AuthCallbackScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/);
    expect(mockApi.exchangeAuthCode).not.toHaveBeenCalled();
    expect(useAuthStore.getState().recovering).toBe(false);
  });

  it('explains that a sign-up link opened elsewhere still verified the email', async () => {
    setParams({ code: 'abc', flow: 'signup' });
    mockApi.exchangeAuthCode.mockRejectedValue(new AppError('AUTH_LINK_INVALID'));
    await renderWithProviders(<AuthCallbackScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Your email is verified\. Sign in to continue\./,
    );
  });
});
