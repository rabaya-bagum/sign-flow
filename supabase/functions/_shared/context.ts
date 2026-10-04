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
  return {
    userId: data.user.id,
    userEmail: data.user.email ?? null,
    admin,
    asUser: userClient(token),
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}
