import AsyncStorage from '@react-native-async-storage/async-storage';

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecureStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockSecureStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecureStore.delete(k)),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) =>
    new Uint8Array(jest.requireActual<typeof import('crypto')>('crypto').randomBytes(n)),
}));

// eslint-disable-next-line import/first
import { secureSessionStorage } from '../secureSessionStorage';

const KEY = 'sb-127-auth-token';
const SESSION = JSON.stringify({ access_token: 'header.payload.signature', refresh_token: 'r'.repeat(40) });

beforeEach(async () => {
  mockSecureStore.clear();
  await AsyncStorage.clear();
});

describe('secureSessionStorage', () => {
  it('round-trips values', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await expect(secureSessionStorage.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('never writes plaintext to AsyncStorage and keeps the key in SecureStore', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    const stored = await AsyncStorage.getItem(KEY);
    expect(stored).not.toContain('access_token');
    expect(stored).not.toBe(SESSION);
    expect([...mockSecureStore.keys()]).toEqual(['signflow.sk.sb-127-auth-token']);
    expect(mockSecureStore.get('signflow.sk.sb-127-auth-token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses a fresh key per write', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    const first = mockSecureStore.get('signflow.sk.sb-127-auth-token');
    await secureSessionStorage.setItem(KEY, SESSION);
    expect(mockSecureStore.get('signflow.sk.sb-127-auth-token')).not.toBe(first);
  });

  it('removes both halves', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    await secureSessionStorage.removeItem(KEY);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(mockSecureStore.size).toBe(0);
  });

  it('returns null when the key is missing (e.g. after reinstall)', async () => {
    await secureSessionStorage.setItem(KEY, SESSION);
    mockSecureStore.clear();
    await expect(secureSessionStorage.getItem(KEY)).resolves.toBeNull();
  });

  it('sanitizes keys SecureStore cannot accept', async () => {
    await secureSessionStorage.setItem('sb:weird/key', 'v');
    expect([...mockSecureStore.keys()]).toEqual(['signflow.sk.sb_weird_key']);
  });
});
