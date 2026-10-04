import { Redirect } from 'expo-router';

import { useAuthStore } from '@/features/auth/store';
import { usePreferencesStore } from '@/store/preferences';

/** Entry point: send the user to the group that matches their session state. */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const recovering = useAuthStore((s) => s.recovering);
  const onboardingSeen = usePreferencesStore((s) => s.onboardingSeen);

  if (recovering) return <Redirect href="/reset-password" />;
  if (status === 'signedIn') return <Redirect href="/home" />;
  if (status === 'mfaRequired') return <Redirect href="/two-factor" />;
  if (!onboardingSeen) return <Redirect href="/onboarding" />;
  return <Redirect href="/welcome" />;
}
