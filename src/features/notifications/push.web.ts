/** Push is native-only (SPEC §13); the web app uses the in-app inbox. */
export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function pushStatus(): Promise<PushStatus> {
  return 'unavailable';
}

export async function enablePush(_prompt: boolean): Promise<PushStatus> {
  return 'unavailable';
}

export function usePushNotifications() {}
