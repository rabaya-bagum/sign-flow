import '@/lib/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { lockPortrait } from '@/hooks/useOrientation';
import { initMonitoring, wrapRoot } from '@/lib/monitoring';
import { useAuthStore } from '@/features/auth/store';
import { queryClient } from '@/lib/queryClient';
import { usePreferencesStore } from '@/store/preferences';
import { ThemeProvider, useTheme } from '@/theme';

initMonitoring();
void SplashScreen.preventAutoHideAsync();
lockPortrait();

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);

function RootNavigator() {
  const theme = useTheme();
  const status = useAuthStore((s) => s.status);
  const recovering = useAuthStore((s) => s.recovering);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const onboardingSeen = usePreferencesStore((s) => s.onboardingSeen);

  // Keep the native splash up until the session and device preferences are restored.
  const ready = status !== 'loading' && hydrated;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = status === 'signedIn';
  const signedOut = status === 'signedOut';
  // Signed in with the password or a social account, but the authenticator code is still owed.
  const secondFactor = status === 'mfaRequired';

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
      >
        {/* index redirects to the right group; guards below decide which groups exist. */}
        <Stack.Screen name="index" />
        <Stack.Protected guard={signedOut && !onboardingSeen}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={(signedOut && onboardingSeen) || recovering || secondFactor}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !recovering}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
        {/* Signing links work signed in or out (SPEC §5.12). */}
        <Stack.Screen name="(guest)" />
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="dev/components" options={{ headerShown: true, title: 'Components' }} />
          <Stack.Screen
            name="dev/coordinate-spike"
            options={{ headerShown: true, title: 'Coordinate spike' }}
          />
        </Stack.Protected>
      </Stack>
    </>
  );
}
