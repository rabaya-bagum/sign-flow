import { act, render } from '@testing-library/react-native';

type Listener = (event: string, session: unknown) => void;
let listener: Listener | undefined;
const mockLink = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));
jest.mock('../api', () => ({ linkRecipientsToUser: () => mockLink() }));
const mockClearLocal = jest.fn();
jest.mock('../localData', () => ({ clearLocalUserData: () => mockClearLocal() }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { clear: jest.fn(), invalidateQueries: jest.fn() } }));

// eslint-disable-next-line import/first
import { queryClient } from '@/lib/queryClient';
// eslint-disable-next-line import/first
import { AuthProvider } from '../AuthProvider';
// eslint-disable-next-line import/first
import { useAuthStore } from '../store';

const session = (id: string) => ({ user: { id } });

beforeEach(() => {
  jest.useFakeTimers();
  mockLink.mockReset().mockResolvedValue(0);
  mockClearLocal.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ status: 'loading', session: null, recovering: false });
});

afterEach(() => jest.useRealTimers());

async function emit(event: string, s: unknown) {
  await act(async () => {
    listener?.(event, s);
    jest.runAllTimers();
  });
}

describe('AuthProvider', () => {
  it('moves from loading to signedOut on an empty initial session', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await emit('INITIAL_SESSION', null);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(mockLink).not.toHaveBeenCalled();
  });

  it('links recipients once per signed-in user', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await emit('INITIAL_SESSION', session('u1'));
    await emit('TOKEN_REFRESHED', session('u1'));
    await emit('SIGNED_IN', session('u1'));
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(mockLink).toHaveBeenCalledTimes(1);
  });

  it('flags password recovery and clears it with cached data on sign-out', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await emit('PASSWORD_RECOVERY', session('u1'));
    expect(useAuthStore.getState().recovering).toBe(true);
    await emit('SIGNED_OUT', null);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', recovering: false });
    expect(queryClient.clear).toHaveBeenCalled();
  });

  it('links again for a different user after sign-out', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await emit('SIGNED_IN', session('u1'));
    await emit('SIGNED_OUT', null);
    await emit('SIGNED_IN', session('u2'));
    expect(mockLink).toHaveBeenCalledTimes(2);
  });

  it('clears device-local files on sign-out and when the account changes, not on refresh', async () => {
    await render(<AuthProvider>{null}</AuthProvider>);
    await emit('INITIAL_SESSION', session('u1'));
    await emit('TOKEN_REFRESHED', session('u1'));
    expect(mockClearLocal).not.toHaveBeenCalled();
    await emit('SIGNED_IN', session('u2')); // switched account without a sign-out event
    expect(mockClearLocal).toHaveBeenCalledTimes(1);
    await emit('SIGNED_OUT', null);
    expect(mockClearLocal).toHaveBeenCalledTimes(2);
  });
});
