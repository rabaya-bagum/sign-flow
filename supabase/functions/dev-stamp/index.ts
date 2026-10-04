// DEV ONLY (see logic.ts). Excluded from `npm run functions:deploy`.
import { corsHeaders, json } from '../_shared/http.ts';
import { serveJson } from '../_shared/serve.ts';
import { DevStampInput, devStamp, devToolsEnabled } from './logic.ts';

if (devToolsEnabled()) {
  serveJson(DevStampInput, devStamp);
} else {
  // Refuse everything, before authentication, so the function reveals nothing.
  Deno.serve((req) =>
    req.method === 'OPTIONS'
      ? new Response('ok', { headers: corsHeaders })
      : json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
  );
}
