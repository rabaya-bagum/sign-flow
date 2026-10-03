import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { AppError } from '@shared/errors';

import { env } from '@/lib/env';
import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

function isCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED' || code === 'SIGN_IN_CANCELLED';
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Sign in with Apple → Supabase ID-token sign-in. Apple receives the SHA-256 of a random nonce and
 * Supabase receives the raw nonce, which binds the identity token to this request.
 */
export async function signInWithApple(): Promise<void> {
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isCancellation(error)) throw new AppError('SIGN_IN_CANCELLED');
    throw toAppError(error);
  }

  if (!credential.identityToken) throw new AppError('UNKNOWN', 'Apple did not return an identity token');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw toAppError(error);

  // Apple only shares the name on the first authorization; persist it when we get it.
  const fullName = credential.fullName
    ? AppleAuthentication.formatFullName(credential.fullName, 'default').trim()
    : '';
  if (fullName && data.user) {
    await supabase.auth.updateUser({ data: { full_name: fullName } });
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.user.id);
  }
}

let googleConfigured = false;

/** Native Google sign-in → Supabase ID-token sign-in. Requires EXPO_PUBLIC_GOOGLE_* (see README). */
export async function signInWithGoogle(): Promise<void> {
  if (!env.isGoogleConfigured) throw new AppError('PROVIDER_UNAVAILABLE');
  // Loaded lazily so the native module is only touched when Google sign-in is actually used.
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

  if (!googleConfigured) {
    GoogleSignin.configure({
      webClientId: env.googleWebClientId,
      iosClientId: env.googleIosClientId || undefined,
    });
    googleConfigured = true;
  }

  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw new AppError('SIGN_IN_CANCELLED');
    const idToken = response.data.idToken;
    if (!idToken) throw new AppError('UNKNOWN', 'Google did not return an ID token');

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw toAppError(error);
  } catch (error) {
    if (isCancellation(error)) throw new AppError('SIGN_IN_CANCELLED');
    throw toAppError(error);
  }
}
