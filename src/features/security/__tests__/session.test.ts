import type { Session } from '@supabase/supabase-js';

import { needsSecondFactor, sessionAal } from '@/features/auth/session';
import { useAuthStore } from '@/features/auth/store';

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (aal: string) => `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u1', aal })}.sig`;
const session = (aal: string, factor?: 'verified' | 'unverified') =>
  ({
    access_token: token(aal),
    user: { id: 'u1', factors: factor ? [{ id: 'f1', status: factor, factor_type: 'totp' }] : [] },
  }) as unknown as Session;

it('reads the assurance level from the access token', () => {
  expect(sessionAal(token('aal2'))).toBe('aal2');
  expect(sessionAal('not-a-jwt')).toBeNull();
});

it('asks for the second factor only when a verified factor exists and the session has not passed it', () => {
  expect(needsSecondFactor(session('aal1'))).toBe(false);
  expect(needsSecondFactor(session('aal1', 'unverified'))).toBe(false);
  expect(needsSecondFactor(session('aal1', 'verified'))).toBe(true);
  expect(needsSecondFactor(session('aal2', 'verified'))).toBe(false);
});

it('the auth store holds such sessions as mfaRequired', () => {
  useAuthStore.getState().setSession(session('aal1', 'verified'));
  expect(useAuthStore.getState().status).toBe('mfaRequired');
  useAuthStore.getState().setSession(session('aal2', 'verified'));
  expect(useAuthStore.getState().status).toBe('signedIn');
  useAuthStore.getState().setSession(null);
  expect(useAuthStore.getState().status).toBe('signedOut');
});
