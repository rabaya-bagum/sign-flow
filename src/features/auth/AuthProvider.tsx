import { useEffect, useRef, type ReactNode } from 'react';

import { setMonitoringUser } from '@/lib/monitoring';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

import { clearLocalUserData } from './localData';
import { linkRecipientsToUser } from './api';
import { useAuthStore } from './store';
import { useAppLockStore } from '@/features/security/appLock';

/** Mirrors Supabase auth state into the auth store and runs per-sign-in side effects. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const linkedFor = useRef<string | null>(null);
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    const { setSession, setRecovering } = useAuthStore.getState();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === 'PASSWORD_RECOVERY') setRecovering(true);

      // Device-local data belongs to one account: drop it on sign-out and when the account changes.
      const userId = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (userId && lastUser.current && userId !== lastUser.current)) {
        void clearLocalUserData();
      }
      if (userId) lastUser.current = userId;
      setMonitoringUser(userId);

      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        linkedFor.current = null;
        lastUser.current = null;
        queryClient.clear();
        // Biometric unlock is per device and account: the next account opts in itself.
        useAppLockStore.getState().setEnabled(false);
      }

      if (userId && linkedFor.current !== userId && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        linkedFor.current = userId;
        // Never await Supabase calls inside this callback (it can deadlock the auth lock).
        setTimeout(() => {
          linkRecipientsToUser()
            .then((linked) => {
              if (linked > 0) void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            })
            .catch((error: unknown) => console.warn('link_recipients_to_user failed', error));
        }, 0);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
