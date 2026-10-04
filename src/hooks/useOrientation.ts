import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/** The app runs in portrait (iOS locks at launch via the config plugin; this covers Android). */
export function lockPortrait(): void {
  if (native) void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

/** Allows landscape while `active` (the signature pad), then returns to portrait. */
export function useAllowLandscape(active: boolean): void {
  useEffect(() => {
    if (!native || !active) return;
    void ScreenOrientation.unlockAsync().catch(() => {});
    return lockPortrait;
  }, [active]);
}
