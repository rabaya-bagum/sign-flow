import type { SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';

/** Fixed-window limiter backed by public.check_rate_limit (service role). */
export async function enforceRateLimit(
  admin: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
) {
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  if (data !== true) throw new HttpError('RATE_LIMITED', 429, 'Too many requests');
}
