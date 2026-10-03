import { requestContext, type RequestContext } from './context.ts';
import { z } from './deps.ts';
import { corsHeaders, errorResponse, HttpError, json } from './http.ts';

/**
 * Standard Edge Function wrapper: CORS, POST-only, JWT → RequestContext, Zod-validated JSON body,
 * and the typed error envelope.
 */
export function serveJson<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, ctx: RequestContext) => Promise<unknown>,
) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (req.method !== 'POST') throw new HttpError('INVALID_INPUT', 405, 'POST only');
      const ctx = await requestContext(req);
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
