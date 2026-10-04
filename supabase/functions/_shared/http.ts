import type { AppErrorCode } from '../../../shared/errors.ts';

/** An expected failure that maps to the `{ error: { code, message } }` envelope (SPEC §10). */
export class HttpError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  // Unexpected: log server-side, never leak internals to the client. Only the name, message and stack
  // are logged, never the whole object (it can carry request data).
  console.error(
    error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : 'Non-error thrown',
  );
  return json({ error: { code: 'UNKNOWN', message: 'Unexpected error' } }, 500);
}
