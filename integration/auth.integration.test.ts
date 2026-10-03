/**
 * End-to-end auth + data checks against local Supabase, exercising the same calls the app makes
 * (src/features/auth/api.ts): sign-up → email verification deep link → PKCE exchange, recipient
 * linking, password recovery, and the dashboard RPCs through PostgREST with real JWTs.
 */
import { adminClient, appClient, followVerifyLink, localStatus, waitForAuthLink } from './localSupabase';

const status = localStatus();
const admin = adminClient(status);
const unique = `${Date.now()}`;
const signupRedirect = 'signflow://auth/callback?flow=signup';
const recoveryRedirect = 'signflow://auth/callback?flow=recovery';

describe('email sign-up with verification (criterion 4, server side)', () => {
  const email = `new.user.${unique}@signflow.test`;
  const password = 'correcthorse1';
  const client = appClient(status);

  // A pending signature request addressed to this email before the account exists.
  let documentId: string;
  beforeAll(async () => {
    // A throwaway sender, so the seed users' dashboards are never affected by this test.
    const sender = await admin.auth.admin.createUser({
      email: `sender.${unique}@signflow.test`,
      password: 'sender-test-pass1',
      email_confirm: true,
    });
    if (sender.error) throw sender.error;
    const { data: doc, error } = await admin
      .from('documents')
      .insert({
        owner_id: sender.data.user.id,
        title: `IT ${unique}.pdf`,
        status: 'in_progress',
        current_signing_order: 1,
      })
      .select('id')
      .single();
    if (error) throw error;
    documentId = doc.id;
    const { error: rErr } = await admin.from('document_recipients').insert({
      document_id: documentId,
      name: 'New User',
      email: email.toUpperCase(), // case must not matter
      role: 'signer',
      signing_order: 1,
      status: 'sent',
    });
    if (rErr) throw rErr;
  });

  it('rejects weak passwords server-side too', async () => {
    const { error } = await appClient(status).auth.signUp({
      email: `weak.${unique}@signflow.test`,
      password: 'short',
    });
    expect(error?.code).toBe('weak_password');
  });

  it('signs up without a session until the email is verified', async () => {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: 'New User' }, emailRedirectTo: signupRedirect },
    });
    expect(error).toBeNull();
    expect(data.session).toBeNull();

    const signIn = await client.auth.signInWithPassword({ email, password });
    expect(signIn.error?.code).toBe('email_not_confirmed');
  });

  it('verifies via the emailed link, which deep-links back with a PKCE code', async () => {
    const link = await waitForAuthLink(status, email, 'signup');
    const deepLink = await followVerifyLink(link);
    expect(`${deepLink.protocol}//${deepLink.host}${deepLink.pathname}`).toBe('signflow://auth/callback');
    expect(deepLink.searchParams.get('flow')).toBe('signup');
    const code = deepLink.searchParams.get('code');
    expect(code).toBeTruthy();

    const { data, error } = await client.auth.exchangeCodeForSession(code!);
    expect(error).toBeNull();
    expect(data.user?.email_confirmed_at).toBeTruthy();
  });

  it('created a profile from sign-up metadata', async () => {
    const { data } = await client.from('profiles').select('full_name, email').single();
    expect(data).toEqual({ full_name: 'New User', email });
  });

  it('links the pending request on sign-in and shows it as needing a signature', async () => {
    const before = await client.from('documents').select('id').eq('id', documentId);
    expect(before.data).toEqual([]);

    const { data: linked } = await client.rpc('link_recipients_to_user');
    expect(linked).toBe(1);

    const { data: summary } = await client.rpc('get_dashboard_summary').single();
    expect(summary).toEqual({ needs_signature: 1, waiting: 0, drafts: 0, completed: 0 });
  });

  it('cannot write protected columns through the API', async () => {
    const { error } = await client.from('documents').update({ status: 'completed' }).eq('id', documentId);
    expect(error?.code).toBe('42501');
  });

  // No cleanup: documents carry append-only audit events (DOCUMENT_CREATED), so they are not
  // deletable. Every run uses unique users; `npm run db:reset` clears local data.
});

describe('password recovery', () => {
  const email = `recover.${unique}@signflow.test`;
  const client = appClient(status);
  let userId: string;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'original-pass1',
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  });

  it('resets the password through the recovery deep link', async () => {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect });
    expect(error).toBeNull();

    const deepLink = await followVerifyLink(await waitForAuthLink(status, email, 'recovery'));
    expect(deepLink.searchParams.get('flow')).toBe('recovery');
    const exchange = await client.auth.exchangeCodeForSession(deepLink.searchParams.get('code')!);
    expect(exchange.error).toBeNull();

    expect((await client.auth.updateUser({ password: 'brand-new-pass2' })).error).toBeNull();
    await client.auth.signOut();

    expect((await client.auth.signInWithPassword({ email, password: 'original-pass1' })).error?.code).toBe(
      'invalid_credentials',
    );
    expect((await client.auth.signInWithPassword({ email, password: 'brand-new-pass2' })).error).toBeNull();
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });
});

describe('seed data through PostgREST (criterion 6)', () => {
  it.each([
    ['owner@signflow.test', { needs_signature: 1, waiting: 2, drafts: 1, completed: 1 }, 'Mutual NDA.pdf'],
    ['recipient@signflow.test', { needs_signature: 1, waiting: 0, drafts: 1, completed: 1 }, undefined],
  ])('%s sees the expected dashboard', async (email, expected, firstRecent) => {
    const client = appClient(status);
    const { error } = await client.auth.signInWithPassword({ email, password: 'SignFlow-dev-123' });
    expect(error).toBeNull();
    const { data: summary } = await client.rpc('get_dashboard_summary').single();
    expect(summary).toEqual(expected);
    const { data: recent } = await client.rpc('list_recent_documents', { p_limit: 5 });
    expect(recent?.length).toBeGreaterThan(0);
    if (firstRecent) expect(recent?.[0]?.title).toBe(firstRecent);
  });

  it('anonymous callers get nothing', async () => {
    const anon = appClient(status);
    const { error } = await anon.from('documents').select('id');
    expect(error?.code).toBe('42501');
  });
});
