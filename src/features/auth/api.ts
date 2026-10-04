import { AppError } from '@shared/errors';
import type { SignInValues, SignUpValues } from '@shared/auth';

import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { authRedirectUrl } from './redirect';

export async function signUpWithEmail({ fullName, email, password }: SignUpValues): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: authRedirectUrl('signup') },
  });
  // With email confirmation on, Supabase deliberately returns success for already-registered emails
  // (no enumeration). We mirror that: the user is told to check their inbox either way.
  if (error) throw toAppError(error);
}

export async function signInWithEmail({ email, password }: SignInValues): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error);
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authRedirectUrl('signup') },
  });
  if (error) throw toAppError(error);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl('recovery'),
  });
  if (error) throw toAppError(error);
}

export async function exchangeAuthCode(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw toAppError(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error);
}

export async function signOut(): Promise<void> {
  // While still signed in (RLS): stop pushes to this device for the leaving account.
  const { forgetDeviceToken } = await import('@/features/notifications/deviceToken');
  await forgetDeviceToken();
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error);
}

/** Links recipient rows addressed to the user's verified email (SPEC §6.4). Returns rows linked. */
export async function linkRecipientsToUser(): Promise<number> {
  const { data, error } = await supabase.rpc('link_recipients_to_user');
  if (error) throw toAppError(error);
  return data ?? 0;
}

export function assertConfigured(configured: boolean): void {
  if (!configured) throw new AppError('PROVIDER_UNAVAILABLE');
}
