import { router, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store';
import { useTheme } from '@/theme';

export default function AuthLayout() {
  const theme = useTheme();
  const secondFactor = useAuthStore((s) => s.status === 'mfaRequired');
  const segments = useSegments();
  const onChallenge = segments[segments.length - 1] === 'two-factor';

  // After any first-factor sign-in (password, Apple, Google), ask for the authenticator code.
  useEffect(() => {
    if (secondFactor && !onChallenge) router.replace('/two-factor');
  }, [secondFactor, onChallenge]);

  return (
    <Stack
      screenOptions={{
        title: '',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: theme.colors.primary,
        headerStyle: { backgroundColor: theme.colors.background },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerBackVisible: false, gestureEnabled: false }} />
      <Stack.Screen name="two-factor" options={{ headerBackVisible: false, gestureEnabled: false }} />
    </Stack>
  );
}
