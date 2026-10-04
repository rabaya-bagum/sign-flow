import type { Session } from '@supabase/supabase-js';

// Pure session checks (no Supabase client), shared by the auth store and the 2FA screens.

/** The JWT's assurance level, read locally (the server verifies the token on every request). */
export function sessionAal(accessToken: string): string | null {
  try {
    const part = accessToken.split('.')[1] ?? '';
    const b64 = part
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    return (JSON.parse(atob(b64)) as { aal?: string }).aal ?? null;
  } catch {
    return null;
  }
}

/** True when the account has a verified factor that this session has not passed yet. */
export function needsSecondFactor(session: Session): boolean {
  const hasFactor = (session.user.factors ?? []).some((f) => f.status === 'verified');
  return hasFactor && sessionAal(session.access_token) !== 'aal2';
}
