import { requestContext, type RequestContext } from './context.ts';
import { z } from './deps.ts';
import { corsHeaders, errorResponse, HttpError, json } from './http.ts';

/**
 * Edge Function pipeline: CORS, POST-only, `buildContext` (which may reject the request), a
 * Zod-validated JSON body, and the typed error envelope.
 */
export function serveWith<S extends z.ZodType, C>(
  schema: S,
  buildContext: (req: Request) => C | Promise<C>,
  handler: (input: z.output<S>, ctx: C) => Promise<unknown>,
) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (req.method !== 'POST') throw new HttpError('INVALID_INPUT', 405, 'POST only');
      const ctx = await buildContext(req);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new HttpError('INVALID_INPUT', 400, 'Body must be JSON');
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new HttpError('INVALID_INPUT', 400, parsed.error.issues[0]?.message);
      return json(await handler(parsed.data, ctx));
    } catch (error) {
      return errorResponse(error);
    }
  });
}

/** Standard wrapper for signed-in endpoints: JWT → RequestContext. */
export function serveJson<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, ctx: RequestContext) => Promise<unknown>,
) {
  serveWith(schema, requestContext, handler);
}
