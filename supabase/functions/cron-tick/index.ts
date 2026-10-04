import { adminClient } from '../_shared/context.ts';
import { errorResponse, HttpError, json } from '../_shared/http.ts';
import { cronTick, secretMatches } from '../_shared/lifecycle.ts';

/** Called by pg_cron every 15 minutes (SPEC §10) with the shared secret; never by users. */
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') throw new HttpError('INVALID_INPUT', 405, 'POST only');
    if (!secretMatches(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'))) {
      throw new HttpError('FORBIDDEN', 401, 'Bad cron secret');
    }
    const result = await cronTick(adminClient());
    console.log('cron-tick', JSON.stringify(result));
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
