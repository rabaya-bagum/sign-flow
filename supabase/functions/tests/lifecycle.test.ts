import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';

import type { SigningSession } from '../../../shared/signing.ts';
import { HttpError } from '../_shared/http.ts';
import {
  cronTick,
  registerPushToken,
  RegisterPushTokenInput,
  remind,
  RemindInput,
  voidDocument,
  VoidDocumentInput,
} from '../_shared/lifecycle.ts';
import { guestConsent, guestOpen, guestSubmit, GuestSubmitInput } from '../_shared/signingHandlers.ts';
import { bytesToBase64 } from '../_shared/crypto.ts';
import { ESIGN_DISCLOSURE_VERSION } from '../../../shared/legal.ts';
import {
  admin,
  createDraft,
  createUser,
  TEST_IP,
  TEST_UA,
  type TestUser,
  uploadOriginal,
} from '../_shared/test/harness.ts';
import { fixture, rgbPng } from '../_shared/test/fixtures.ts';
import { processUpload } from '../process-upload/logic.ts';
import { sendDocument, SendDocumentInput } from '../send-document/logic.ts';

const MAILPIT = 'http://127.0.0.1:54324';
Deno.env.set('MAILPIT_API_URL', MAILPIT);
Deno.env.set('PUBLIC_SIGNING_URL', 'https://sign.signflow.test');

// A stand-in for the Expo Push API that records what it was sent.
const pushed: { to: string; title: string; body: string; data: Record<string, string> }[] = [];
let deadTokens = new Set<string>();
const pushServer = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
  const batch = (await req.json()) as (typeof pushed)[number][];
  pushed.push(...batch);
  return Response.json({
    data: batch.map((m) =>
      deadTokens.has(m.to)
        ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'x' },
    ),
  });
});
Deno.env.set('EXPO_PUSH_URL', `http://127.0.0.1:${pushServer.addr.port}/push`);

const unique = crypto.randomUUID().slice(0, 8);
const mail = (label: string) => `${label}.${unique}@lifecycle.test`;
const guestReq = () => ({ admin: admin(), ip: TEST_IP, userAgent: TEST_UA });

async function inbox(email: string): Promise<{ ID: string; Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return (await res.json()).messages ?? [];
}
async function text(id: string): Promise<string> {
  return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text as string;
}
async function latestToken(email: string): Promise<string> {
  for (const m of await inbox(email)) {
    const match = (await text(m.ID)).match(/\/s\/([A-Za-z0-9_-]{43})/);
    if (match) return match[1]!;
  }
  throw new Error(`no link for ${email}`);
}
async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  what: string,
  ms = 30000,
): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}
async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await assertRejects(() => promise as Promise<unknown>, HttpError);
  assertEquals(error.code, code, error.message);
}

async function sent(
  owner: TestUser,
  recipients: { name: string; email: string; order?: number }[],
  options: Record<string, unknown> = {},
) {
  const id = await createDraft(owner, `Lifecycle ${crypto.randomUUID().slice(0, 4)}`);
  await uploadOriginal(owner, id, fixture('pdf/portrait-3p.pdf'));
  await processUpload({ document_id: id }, owner.ctx);
  const fields = [];
  const ids: Record<string, string> = {};
  for (const r of recipients) {
    const { data } = await owner.client
      .from('document_recipients')
      .insert({ document_id: id, name: r.name, email: r.email, signing_order: r.order ?? 1 })
      .select('id')
      .single();
    ids[r.email] = data!.id;
    fields.push({
      id: crypto.randomUUID(),
      recipient_id: data!.id,
      page_number: 1,
      type: 'signature',
      x: 0.1,
      y: 0.1 + fields.length * 0.1,
      width: 0.3,
      height: 0.05,
      required: true,
      properties: {},
    });
  }
  await owner.client.rpc('save_document_fields', { p_document_id: id, p_fields: fields });
  await sendDocument(SendDocumentInput.parse({ document_id: id, ...options }), owner.ctx);
  return { id, ids };
}

const owner = await createUser('life-owner');
const PNG = bytesToBase64(await rgbPng(60, 20, (x) => (x % 7 ? [255, 255, 255] : [0, 0, 0])));

Deno.test({
  name: 'reminders and expiry fire from the pg_cron job (time travel; P7 done-when)',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const due = mail('due');
    const fresh = mail('fresh');
    const late = mail('late');
    const reminded = await sent(
      owner,
      [
        { name: 'Dee Due', email: due },
        { name: 'Fred Fresh', email: fresh },
      ],
      {
        reminder_first_after_days: 2,
        reminder_repeat_every_days: 2,
      },
    );
    const expiring = await sent(owner, [{ name: 'Lee Late', email: late }]);
    const firstLink = await latestToken(due);

    // Time travel: Dee was asked 3 days ago; Fred just now. The second document expired an hour ago.
    await admin()
      .from('document_recipients')
      .update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .eq('id', reminded.ids[due]);
    await admin()
      .from('documents')
      .update({ expires_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq('id', expiring.id);

    // Exactly what the scheduled job runs: select public.run_cron_tick() → POST to cron-tick.
    const { data: requestId, error } = await admin().rpc('run_cron_tick');
    assert(!error, error?.message);
    assert(requestId, 'run_cron_tick needs the Vault secrets seeded by supabase/seed.sql');

    const reminder = await waitFor(
      async () => (await inbox(due)).find((m) => m.Subject.startsWith('Reminder:')),
      'a reminder email (is functions:serve running?)',
    );
    assertMatch(reminder.Subject, /Reminder: Test life-owner sent you "Lifecycle/);
    assertEquals(
      (await inbox(fresh)).filter((m) => m.Subject.startsWith('Reminder:')).length,
      0,
      'not due yet',
    );
    const newLink = await latestToken(due);
    assert(newLink !== firstLink, 'the reminder carries a new link');
    await assertRejects(() => guestOpen({ token: firstLink }, guestReq()), HttpError, 'replaced');

    const { data: doc } = await waitFor(async () => {
      const res = await admin().from('documents').select('status').eq('id', expiring.id).single();
      return res.data?.status === 'expired' ? res : null;
    }, 'the document to expire');
    assertEquals(doc!.status, 'expired');
    await waitFor(
      async () => (await inbox(owner.email)).find((m) => m.Subject.startsWith('Expired:')),
      'the expiry email',
    );
    const lateLink = await latestToken(late);
    assertEquals(((await guestOpen({ token: lateLink }, guestReq())) as SigningSession).state, 'expired');

    const { data: events } = await admin()
      .from('document_events')
      .select('type, document_id, metadata')
      .in('document_id', [reminded.id, expiring.id]);
    assert(
      events!.some(
        (e) =>
          e.type === 'REMINDER_SENT' &&
          e.document_id === reminded.id &&
          (e.metadata as { automatic?: boolean }).automatic,
      ),
    );
    assert(events!.some((e) => e.type === 'DOCUMENT_EXPIRED' && e.document_id === expiring.id));
    const { data: notes } = await admin()
      .from('notifications')
      .select('type')
      .eq('user_id', owner.id)
      .eq('document_id', expiring.id);
    assert(
      notes!.some((n) => n.type === 'expired'),
      'owner notified in the app',
    );

    // A second tick sends nothing new (claims are atomic and once-only).
    const before = (await inbox(due)).length;
    await cronTick(admin());
    assertEquals((await inbox(due)).length, before);
  },
});

Deno.test('Remind: new link, once per 24 hours per recipient, owner only', async () => {
  const signer = mail('remind');
  const { id, ids } = await sent(owner, [{ name: 'Rita', email: signer }]);
  const old = await latestToken(signer);
  const result = await remind(RemindInput.parse({ document_id: id, recipient_id: ids[signer] }), owner.ctx);
  assertEquals(result, { reminded: 1, skipped: [] });
  assert((await inbox(signer)).some((m) => m.Subject.startsWith('Reminder:')));
  assert((await latestToken(signer)) !== old);
  await expectCode(
    remind(RemindInput.parse({ document_id: id, recipient_id: ids[signer] }), owner.ctx),
    'RATE_LIMITED',
  );
  await expectCode(remind(RemindInput.parse({ document_id: id }), owner.ctx), 'RATE_LIMITED');
  const stranger = await createUser('life-stranger');
  await expectCode(remind(RemindInput.parse({ document_id: id }), stranger.ctx), 'NOT_FOUND');
});

Deno.test('Void: links stop working, recipients are emailed and notified, can only happen once', async () => {
  const guest = mail('voided');
  const linked = await createUser('life-linked');
  const { id } = await sent(owner, [
    { name: 'Vic', email: guest },
    { name: 'Linked', email: linked.email },
  ]);
  const token = await latestToken(guest);
  await expectCode(
    voidDocument(VoidDocumentInput.parse({ document_id: id, reason: 'x' }), linked.ctx),
    'FORBIDDEN',
  );
  await voidDocument(
    VoidDocumentInput.parse({ document_id: id, reason: 'Wrong version attached' }),
    owner.ctx,
  );
  const cancelled = (await inbox(guest)).find((m) => m.Subject.startsWith('Cancelled:'));
  assert(cancelled, 'guest emailed');
  assertMatch(await text(cancelled.ID), /Wrong version attached/);
  assertEquals(((await guestOpen({ token }, guestReq())) as SigningSession).state, 'voided');
  const { data: notes } = await linked.client
    .from('notifications')
    .select('type, title')
    .eq('document_id', id);
  assert(
    notes!.some((n) => n.type === 'voided'),
    'linked recipient sees it in the inbox',
  );
  await expectCode(
    voidDocument(VoidDocumentInput.parse({ document_id: id, reason: 'again' }), owner.ctx),
    'INVALID_STATE',
  );
  const { data: doc } = await admin()
    .from('documents')
    .select('status, void_reason, voided_at')
    .eq('id', id)
    .single();
  assertEquals([doc!.status, doc!.void_reason], ['voided', 'Wrong version attached']);
});

Deno.test('push and in-app notices follow preferences; dead tokens are removed', async () => {
  const signerUser = await createUser('life-push');
  const token = `ExponentPushToken[${crypto.randomUUID()}]`;
  await registerPushToken(RegisterPushTokenInput.parse({ token, platform: 'ios' }), signerUser.ctx);
  assert(!RegisterPushTokenInput.safeParse({ token: 'not-a-token', platform: 'ios' }).success);

  pushed.length = 0;
  const first = await sent(owner, [{ name: 'Pat Push', email: signerUser.email }]);
  const request = pushed.find((p) => p.to === token);
  assert(request, 'signature request pushed to the linked recipient');
  assertEquals(request.data, { documentId: first.id, type: 'request' });
  const { data: inboxRows } = await signerUser.client
    .from('notifications')
    .select('type, read_at')
    .eq('document_id', first.id);
  assertEquals(inboxRows, [{ type: 'request', read_at: null }]);

  // Push off: still in the inbox, not pushed.
  await admin()
    .from('profiles')
    .update({ notification_prefs: { push: false } })
    .eq('id', signerUser.id);
  pushed.length = 0;
  const second = await sent(owner, [{ name: 'Pat Push', email: signerUser.email }]);
  assertEquals(pushed.filter((p) => p.to === token).length, 0);
  const { count } = await signerUser.client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', second.id);
  assertEquals(count, 1);

  // An uninstalled app's token is dropped after Expo reports DeviceNotRegistered.
  await admin().from('profiles').update({ notification_prefs: {} }).eq('id', signerUser.id);
  deadTokens = new Set([token]);
  await sent(owner, [{ name: 'Pat Push', email: signerUser.email }]);
  const { data: tokens } = await signerUser.client.from('push_tokens').select('id');
  assertEquals(tokens!.length, 0);
  deadTokens = new Set();
});

Deno.test('the owner is notified when a recipient opens and signs; email respects preferences', async () => {
  const guest = mail('activity');
  const { id } = await sent(owner, [{ name: 'Ava Activity', email: guest }]);
  const token = await latestToken(guest);
  await guestOpen({ token }, guestReq());
  const { data: notes } = await owner.client
    .from('notifications')
    .select('type, title')
    .eq('document_id', id);
  assertEquals(notes, [{ type: 'viewed', title: 'Ava Activity opened your document' }]);
  // A second open does not notify again.
  await guestOpen({ token }, guestReq());
  const { count } = await owner.client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', id);
  assertEquals(count, 1);

  // Signing: in the inbox always; by email only while the owner allows activity emails.
  const signAs = async (link: string) => {
    const session = (await guestOpen({ token: link }, guestReq())) as SigningSession;
    await guestConsent({ token: link, disclosure_version: ESIGN_DISCLOSURE_VERSION }, guestReq());
    await guestSubmit(
      GuestSubmitInput.parse({
        token: link,
        values: session.fields.map((f) => ({ field_id: f.id, asset: 's' })),
        assets: { s: PNG },
      }),
      guestReq(),
    );
  };
  const signedMails = async () =>
    (await inbox(owner.email)).filter((m) => m.Subject.startsWith('Ava Activity signed')).length;
  const before = await signedMails();
  await admin()
    .from('profiles')
    .update({ notification_prefs: { topics: { activity: false } } })
    .eq('id', owner.id);
  const quiet = await sent(owner, [
    { name: 'Ava Activity', email: guest },
    { name: 'Other', email: mail('other') },
  ]);
  await signAs(await latestToken(guest));
  assertEquals(await signedMails(), before, 'no email with activity emails off');
  const { data: quietNotes } = await owner.client
    .from('notifications')
    .select('type')
    .eq('document_id', quiet.id)
    .eq('type', 'signed');
  assertEquals(quietNotes!.length, 1, 'still in the inbox');
  await admin().from('profiles').update({ notification_prefs: {} }).eq('id', owner.id);
  await sent(owner, [
    { name: 'Ava Activity', email: guest },
    { name: 'Other', email: mail('other2') },
  ]);
  await signAs(await latestToken(guest));
  assertEquals(await signedMails(), before + 1, 'emailed with the default preferences');
});
