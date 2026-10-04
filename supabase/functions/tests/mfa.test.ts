import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { createClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';
import { contextFor, createDraft, createUser, localStatus, signIn, totp } from '../_shared/test/harness.ts';

Deno.test({
  name: 'with a verified TOTP factor, only aal2 sessions reach data and functions',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const user = await createUser('mfa');
    const draft = await createDraft(user, 'Before 2FA');

    const { data: factor, error: enrollError } = await user.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Test phone',
      issuer: 'SignFlow',
    });
    assert(!enrollError && factor, enrollError?.message);
    // An unverified factor changes nothing yet.
    assertEquals((await user.client.from('documents').select('id').eq('id', draft)).data?.length, 1);

    const { data: verified, error: verifyError } = await user.client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: await totp(factor.totp.secret),
    });
    assert(!verifyError && verified, verifyError?.message);

    // A password-only sign-in (aal1) now sees nothing and every function refuses it.
    // signIn builds a RequestContext, which must refuse an aal1 session.
    const aal1 = await signIn(user.email, 'function-test-pass1').catch((e) => e);
    assert(aal1 instanceof HttpError && aal1.code === 'MFA_REQUIRED', String(aal1));
    const s = localStatus();
    const client = createClient(s.API_URL, s.ANON_KEY, { auth: { persistSession: false } });
    const { data: session } = await client.auth.signInWithPassword({
      email: user.email,
      password: 'function-test-pass1',
    });
    assertEquals(
      (await client.from('documents').select('id').eq('id', draft)).data?.length,
      0,
      'aal1 session reads no documents',
    );
    const { error: insertError } = await client.from('documents').insert({ owner_id: user.id, title: 'x' });
    assert(insertError, 'aal1 session cannot create documents');
    const { data: files } = await client.storage.from('signatures').list(user.id);
    assertEquals(files?.length ?? 0, 0);
    const refused = await assertRejects(() => contextFor(session.session!.access_token), HttpError);
    assertEquals(refused.code, 'MFA_REQUIRED');

    // Passing the challenge upgrades the session.
    const { error: stepUpError } = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: await totp(factor.totp.secret),
    });
    assert(!stepUpError, stepUpError?.message);
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    assertEquals(aal?.currentLevel, 'aal2');
    assertEquals((await client.from('documents').select('id').eq('id', draft)).data?.length, 1);
    const { data: fresh } = await client.auth.getSession();
    const ctx = await contextFor(fresh.session!.access_token);
    assertEquals(ctx.aal, 'aal2');
  },
});
