import { adminClient, clientIp } from './context.ts';
import { z } from './deps.ts';
import { serveWith } from './serve.ts';
import type { GuestRequest } from './signing.ts';

/**
 * Wrapper for guest endpoints (SPEC §5.12, §7): like serveJson, but there is no user session. The
 * caller proves access with the link token in the body, which the handler validates on every call.
 */
export function serveGuest<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, req: GuestRequest) => Promise<unknown>,
) {
  serveWith(
    schema,
    (req): GuestRequest => ({
      admin: adminClient(),
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent'),
    }),
    handler,
  );
}
