import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { guestSigningClient } from '@/features/signing/api';
import { SigningFlow } from '@/features/signing/SigningFlow';
import { useTheme } from '@/theme';

/** Signing link from the email: https://<signing domain>/s/<token> (also a universal/App Link). */
export default function GuestSigningRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const theme = useTheme();
  const client = useMemo(() => guestSigningClient(token ?? ''), [token]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <SigningFlow client={client} />
    </SafeAreaView>
  );
}
