import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { AppError, isAppErrorCode } from '@shared/errors';

import { toAppError } from './errors';
import { supabase } from './supabase';

/** Maps an Edge Function failure to an AppError using the `{ error: { code, message } }` envelope. */
export async function functionError(error: unknown): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await (error.context as Response).json()) as {
        error?: { code?: unknown; message?: string };
      };
      const code = body.error?.code;
      if (isAppErrorCode(code)) return new AppError(code, body.error?.message, { cause: error });
    } catch {
      // Non-JSON body (e.g. a gateway error page): fall through.
    }
    return new AppError('UNKNOWN', error.message, { cause: error });
  }
  if (error instanceof FunctionsFetchError)
    return new AppError('NETWORK_OFFLINE', undefined, { cause: error });
  return toAppError(error);
}

/** Calls an Edge Function with the signed-in user's JWT (supabase-js attaches it). */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw await functionError(error);
  return data as T;
}
