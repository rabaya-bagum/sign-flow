import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Supabase session storage for native platforms. Sessions exceed SecureStore's practical value-size
// limit, so the value is AES-256-CTR encrypted with a fresh random key on every write: the key lives
// in SecureStore (Keychain / Keystore), the ciphertext in AsyncStorage. A key is never reused, so the
// fixed CTR counter is safe.

const KEY_PREFIX = 'signflow.sk.';

function secureKeyName(key: string): string {
  // SecureStore keys may only contain alphanumerics, '.', '-' and '_'.
  return KEY_PREFIX + key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = Crypto.getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(secureKeyName(key), aesjs.utils.hex.fromBytes(encryptionKey));
  return aesjs.utils.hex.fromBytes(encrypted);
}

async function decrypt(key: string, value: string): Promise<string | null> {
  const encryptionKeyHex = await SecureStore.getItemAsync(secureKeyName(key));
  if (!encryptionKeyHex) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(encryptionKeyHex),
    new aesjs.Counter(1),
  );
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await decrypt(key, encrypted);
    } catch {
      // Corrupt or orphaned ciphertext: drop it so the user simply signs in again.
      await this.removeItem(key);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(secureKeyName(key));
  },
};
