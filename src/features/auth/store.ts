import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  /** True between opening a password-recovery link and setting the new password. */
  recovering: boolean;
  setSession: (session: Session | null) => void;
  setRecovering: (recovering: boolean) => void;
}

// In-memory only: the session itself is persisted (encrypted) by the Supabase client.
export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  session: null,
  recovering: false,
  setSession: (session) => set({ session, status: session ? 'signedIn' : 'signedOut' }),
  setRecovering: (recovering) => set({ recovering }),
}));

export function useCurrentUserId(): string | null {
  return useAuthStore((s) => s.session?.user.id ?? null);
}
