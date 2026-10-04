import type { Session } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

/** Whether the account signs in with a password (social-only accounts have none). */
export function hasPassword(session: Session | null): boolean {
  return (session?.user.identities ?? []).some((i) => i.provider === 'email');
}

/** Social providers linked to the account, for "sign in again" (Apple first: it's the iOS default). */
export function socialProviders(session: Session | null): ('apple' | 'google')[] {
  const providers = new Set((session?.user.identities ?? []).map((i) => i.provider));
  return (['apple', 'google'] as const).filter((p) => providers.has(p));
}

/**
 * Changes the password. Supabase asks for re-authentication when the last sign-in is not recent
 * (secure_password_change): that fails with REAUTH_REQUIRED, the caller sends a code by email with
 * requestReauthCode() and retries with it as `nonce`.
 */
export async function changePassword(password: string, nonce?: string): Promise<void> {
  const { error } = await supabase.auth.updateUser(nonce ? { password, nonce } : { password });
  if (error) throw toAppError(error);
}

export async function requestReauthCode(): Promise<void> {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw toAppError(error);
}

/** "Sign out of all other devices" (SPEC §5.10): revokes every other session's refresh token. */
export async function signOutOtherDevices(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw toAppError(error);
}

/**
 * Deletes the account (SPEC §17.3). Password accounts confirm with their password; social-only
 * accounts must have signed in within the last 10 minutes (REAUTH_REQUIRED otherwise). The server
 * revokes every session; this device then drops its copy.
 */
export async function deleteAccount(password?: string): Promise<void> {
  await invokeFunction('delete-account', password ? { password } : {});
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
