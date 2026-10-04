import { createClient, type SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';

export interface RequestContext {
  userId: string;
  userEmail: string | null;
  /** Service-role client: bypasses RLS, so every use must be preceded by an explicit check. */
  admin: SupabaseClient;
  /** Client acting as the caller: RLS applies. Use it to authorize document access. */
  asUser: SupabaseClient;
  ip: string | null;
  userAgent: string | null;
  /** Assurance level of the session: 'aal2' after a second factor (SPEC §5.10 2FA). */
  aal: string | null;
  /** Unix seconds of the latest sign-in or factor check in this session (JWT `amr`). */
  authenticatedAt: number | null;
}

/** Reads the JWT payload. Only call after the token has been verified (auth.getUser). */
function jwtClaims(token: string): { aal?: string; amr?: { timestamp?: number }[] } {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const IP_PATTERN = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/i;

/** First hop of X-Forwarded-For, if it looks like an IP (stored as Postgres inet). */
export function clientIp(req: Request): string | null {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return IP_PATTERN.test(first) ? first : null;
}

export async function requestContext(req: Request): Promise<RequestContext> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError('FORBIDDEN', 401, 'Missing access token');
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError('FORBIDDEN', 401, 'Invalid access token');
  const claims = jwtClaims(token);
  // Two-factor (SPEC §5.10): with a verified factor, only sessions that passed it may act.
  if ((data.user.factors ?? []).some((f) => f.status === 'verified') && claims.aal !== 'aal2') {
    throw new HttpError('MFA_REQUIRED', 403, 'Two-factor verification required');
  }
  const times = (claims.amr ?? []).map((a) => a.timestamp ?? 0).filter((t) => t > 0);
  return {
    userId: data.user.id,
    userEmail: data.user.email ?? null,
    admin,
    asUser: userClient(token),
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent'),
    aal: claims.aal ?? null,
    authenticatedAt: times.length ? Math.max(...times) : null,
  };
}
