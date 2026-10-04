import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Biometric unlock (SPEC §5.10, SHOULD): when on, the app asks for Face ID / Touch ID / fingerprint
 * (or the device passcode) at launch and after it has been in the background for LOCK_AFTER_MS.
 * A device setting: it is turned off at sign-out so the next account starts without it.
 */
export const LOCK_AFTER_MS = 60_000;

interface AppLockState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useAppLockStore = create<AppLockState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: 'signflow.app-lock', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export type BiometricAvailability = 'available' | 'notEnrolled' | 'unsupported';

export async function biometricAvailability(): Promise<BiometricAvailability> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return 'unsupported';
    return (await LocalAuthentication.isEnrolledAsync()) ? 'available' : 'notEnrolled';
  } catch {
    return 'unsupported';
  }
}

/** Shows the system prompt. The device passcode is allowed as a fallback. */
export async function authenticate(promptMessage: string, cancelLabel: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel });
    return result.success;
  } catch {
    return false;
  }
}
