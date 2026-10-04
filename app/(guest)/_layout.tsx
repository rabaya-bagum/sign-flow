import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** Guest signing (SPEC §5.12): reachable signed in or not; never needs a Supabase session. */
export default function GuestLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}
    />
  );
}
