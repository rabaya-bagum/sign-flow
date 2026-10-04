import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/types/database';

import { env } from './env';
import { secureSessionStorage } from './secureSessionStorage';

const isWeb = Platform.OS === 'web';

export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://127.0.0.1:54321',
  env.supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      // Web (dev smoke tests, Phase 6 guest page) uses the default localStorage; native uses
      // encrypted storage backed by the Keychain / Keystore.
      storage: isWeb ? undefined : secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // app/auth/callback.tsx exchanges codes explicitly
      flowType: 'pkce',
    },
  },
);

// Refresh tokens only while the app is in the foreground (supabase-js guidance for React Native).
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
