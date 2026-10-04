import { adminClient, clientIp } from './context.ts';
import { z } from './deps.ts';
import { corsHeaders, errorResponse, HttpError, json } from './http.ts';
import type { GuestRequest } from './signing.ts';

/**
 * Wrapper for guest endpoints (SPEC §5.12, §7): like serveJson, but there is no user session. The
 * caller proves access with the link token in the body, which the handler validates on every call.
 */
export function serveGuest<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, req: GuestRequest) => Promise<unknown>,
) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (req.method !== 'POST') throw new HttpError('INVALID_INPUT', 405, 'POST only');
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new HttpError('INVALID_INPUT', 400, 'Body must be JSON');
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new HttpError('INVALID_INPUT', 400, parsed.error.issues[0]?.message);
      return json(
        await handler(parsed.data, {
          admin: adminClient(),
          ip: clientIp(req),
          userAgent: req.headers.get('user-agent'),
        }),
      );
    } catch (error) {
      return errorResponse(error);
    }
  });
}
