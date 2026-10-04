import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';

import { registerPushToken } from './api';
import { setDeviceToken } from './deviceToken';

/** Push notifications (SPEC §13): Expo push tokens, registered with register-push-token. */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** EAS project ID (required for Expo push tokens); set EAS_PROJECT_ID at build time. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Registers this device for push. With `prompt`, asks for permission first (only from an explicit
 * action, such as turning push on in Account → Notifications); without it, only refreshes an
 * existing grant.
 */
export async function enablePush(prompt: boolean): Promise<PushStatus> {
  let status = await pushStatus();
  if (status === 'unavailable') return status;
  if (status !== 'granted' && prompt) {
    const result = await Notifications.requestPermissionsAsync();
    status = result.status === 'granted' ? 'granted' : 'denied';
  }
  if (status !== 'granted') return status;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SignFlow',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  setDeviceToken(token);
  return status;
}

/** Signed-in shell: refresh an existing grant, open documents from taps, refresh the inbox. */
export function usePushNotifications() {
  const queryClient = useQueryClient();
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    void enablePush(false).catch(() => undefined);
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });
    return () => received.remove();
  }, [queryClient]);

  useEffect(() => {
    const documentId = last?.notification.request.content.data?.documentId;
    if (typeof documentId === 'string' && documentId) {
      router.push({ pathname: '/documents/[id]', params: { id: documentId } });
    }
  }, [last]);
}
