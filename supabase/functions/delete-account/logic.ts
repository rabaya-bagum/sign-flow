import type { RequestContext } from '../_shared/context.ts';
import { createClient, z } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';
import { voidOwnedDocument } from '../_shared/lifecycle.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

export const DeleteAccountInput = z.object({
  /** Required for accounts with a password; social-only accounts sign in again instead. */
  password: z.string().min(1).max(200).optional(),
});

/** How recent a social sign-in must be to count as re-authentication. */
export const REAUTH_WINDOW_SECONDS = 10 * 60;
export const VOID_REASON = 'The sender closed their SignFlow account.';

/**
 * Confirms the caller is present: their password, or a sign-in in the last few minutes. A second
 * factor, if the account has one, was already required by requestContext.
 */
async function reauthenticate(input: z.output<typeof DeleteAccountInput>, ctx: RequestContext) {
  const { data, error } = await ctx.admin.auth.admin.getUserById(ctx.userId);
  if (error || !data.user) throw new HttpError('FORBIDDEN', 401, 'Account not found');
  const user = data.user;

  const hasPassword = (user.identities ?? []).some((i) => i.provider === 'email');
  if (hasPassword) {
    if (!input.password) throw new HttpError('REAUTH_REQUIRED', 401, 'Password required');
    const probe = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn, error: signInError } = await probe.auth.signInWithPassword({
      email: user.email ?? '',
      password: input.password,
    });
    if (signInError || !signedIn.session) throw new HttpError('INVALID_CREDENTIALS', 403, 'Wrong password');
    // The check session is not needed; every session goes with the account below anyway.
    await probe.auth.signOut({ scope: 'local' }).catch(() => undefined);
  } else {
    const fresh = ctx.authenticatedAt && ctx.authenticatedAt >= Date.now() / 1000 - REAUTH_WINDOW_SECONDS;
    if (!fresh) throw new HttpError('REAUTH_REQUIRED', 401, 'Sign in again to continue');
  }
}

/**
 * Deletes the caller's account (SPEC §17.3): re-authenticates, voids their documents in progress
 * (recipients are told), removes their own data and files, keeps what other participants' records need,
 * and soft-deletes the auth user, which signs them out everywhere.
 */
export async function deleteAccount(input: z.output<typeof DeleteAccountInput>, ctx: RequestContext) {
  await enforceRateLimit(ctx.admin, `delete-account:${ctx.userId}`, 5, 3600);
  await reauthenticate(input, ctx);

  const { data: inProgress, error: listError } = await ctx.admin
    .from('documents')
    .select('id')
    .eq('owner_id', ctx.userId)
    .eq('status', 'in_progress')
    .is('deleted_at', null);
  if (listError) throw listError;
  for (const doc of inProgress ?? []) {
    try {
      await voidOwnedDocument({ document_id: doc.id, reason: VOID_REASON }, ctx);
    } catch (e) {
      // Finished or voided in the meantime: nothing left to cancel.
      if (!(e instanceof HttpError && e.code === 'INVALID_STATE')) throw e;
    }
  }

  const { data, error } = await ctx.admin.rpc('delete_account_data', { p_user_id: ctx.userId });
  if (error) {
    if (error.code === 'P0002') throw new HttpError('NOT_FOUND', 404, 'Account not found');
    if (error.code === 'SF031') throw new HttpError('INVALID_STATE', 409, error.message);
    throw error;
  }
  const result = data as { documents: string[]; objects: { bucket: string; name: string }[] };

  const byBucket = new Map<string, string[]>();
  for (const o of result.objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 500) {
      const { error: removeError } = await ctx.admin.storage.from(bucket).remove(names.slice(i, i + 500));
      // Data is already gone from the account; a leftover file must not keep the account alive.
      if (removeError) console.error('account file removal failed', bucket, removeError.message);
    }
  }

  const { error: authError } = await ctx.admin.auth.admin.deleteUser(ctx.userId, true);
  if (authError) throw authError;
  return { deleted: true, documents_removed: result.documents.length };
}
