import { removePushToken } from './api';

/** This device's Expo push token once registered (kept in memory only). */
let current: string | null = null;

export function setDeviceToken(token: string | null) {
  current = token;
}

/** At sign-out, stop pushes to this device for the account that is leaving. Never throws. */
export async function forgetDeviceToken(): Promise<void> {
  if (!current) return;
  const token = current;
  current = null;
  await removePushToken(token).catch(() => undefined);
}
