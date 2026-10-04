import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';

import { HttpError } from '../_shared/http.ts';
import {
  admin,
  createDraft,
  createUser,
  events,
  type TestUser,
  uploadOriginal,
} from '../_shared/test/harness.ts';
import { fixture } from '../_shared/test/fixtures.ts';
import { hashToken } from '../_shared/tokens.ts';
import { processUpload } from '../process-upload/logic.ts';
import { sendDocument, SendDocumentInput } from '../send-document/logic.ts';

const MAILPIT = 'http://127.0.0.1:54324';
Deno.env.set('MAILPIT_API_URL', MAILPIT);
Deno.env.set('PUBLIC_SIGNING_URL', 'https://sign.signflow.test');

const owner = await createUser('send-owner');
const unique = crypto.randomUUID().slice(0, 8);
const mail = (label: string) => `${label}.${unique}@send.test`;

async function inbox(email: string): Promise<{ Subject: string; ID: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return (await res.json()).messages ?? [];
}
async function messageText(id: string): Promise<string> {
  return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text as string;
}

async function draftWith(
  user: TestUser,
  recipients: {
    name: string;
    email: string | null;
    role?: string;
    order?: number;
    signature?: boolean;
    text?: boolean;
  }[],
) {
  const id = await createDraft(user, `Send test ${crypto.randomUUID().slice(0, 4)}`);
  await uploadOriginal(user, id, fixture('pdf/portrait-3p.pdf'));
  await processUpload({ document_id: id }, user.ctx);
  const fields: Record<string, unknown>[] = [];
  const ids: string[] = [];
  for (const r of recipients) {
    const { data, error } = await user.client
      .from('document_recipients')
      .insert({
        document_id: id,
        name: r.name,
        email: r.email,
        role: r.role ?? 'signer',
        signing_order: r.order ?? 1,
      })
      .select('id')
      .single();
    if (error) throw error;
    ids.push(data.id);
    const base = {
      recipient_id: data.id,
      page_number: 1,
      x: 0.1,
      y: 0.1 + fields.length * 0.1,
      width: 0.3,
      height: 0.05,
      required: true,
    };
    if (r.signature !== false && (r.role ?? 'signer') === 'signer')
      fields.push({ ...base, id: crypto.randomUUID(), type: 'signature', properties: {} });
    if (r.text)
      fields.push({
        ...base,
        id: crypto.randomUUID(),
        type: 'text',
        properties: { fontSize: 12, align: 'left', validation: 'none' },
      });
  }
  const { error } = await user.client.rpc('save_document_fields', { p_document_id: id, p_fields: fields });
  if (error) throw error;
  return { id, recipientIds: ids };
}

const send = (id: string, extra: Record<string, unknown> = {}) =>
  sendDocument(SendDocumentInput.parse({ document_id: id, ...extra }), owner.ctx);

async function expectCode(promise: Promise<unknown>, code: string, pattern?: RegExp) {
  const error = await assertRejects(() => promise as Promise<unknown>, HttpError);
  assertEquals(error.code, code);
  if (pattern) assertMatch(error.message, pattern);
}

Deno.test('refuses incomplete drafts with the reasons', async () => {
  const empty = await draftWith(owner, []);
  await expectCode(send(empty.id), 'INVALID_INPUT', /NO_RECIPIENTS/);
  const placeholder = await draftWith(owner, [{ name: 'Signer 1', email: null }]);
  await expectCode(send(placeholder.id), 'INVALID_INPUT', /MISSING_EMAIL/);
  const noSignature = await draftWith(owner, [
    { name: 'A', email: mail('nosig'), signature: false, text: true },
  ]);
  await expectCode(send(noSignature.id), 'INVALID_INPUT', /SIGNER_WITHOUT_SIGNATURE/);
  const { data } = await admin()
    .from('documents')
    .select('status')
    .in('id', [empty.id, placeholder.id, noSignature.id]);
  assert(data!.every((d) => d.status === 'draft'));
});

Deno.test(
  'two sequential signers: only the first is emailed; the draft is locked (P4 done-when)',
  async () => {
    const first = mail('first');
    const second = mail('second');
    const { id, recipientIds } = await draftWith(owner, [
      { name: 'First Signer', email: first, order: 1, text: true },
      { name: 'Second Signer', email: second, order: 2 },
    ]);
    const result = await send(id, { email_subject: 'Please sign the lease', email_message: 'Thanks!\nJohn' });
    assertEquals(result, { document_id: id, status: 'in_progress', notified: 1, failed: [] });

    const { data: doc } = await admin()
      .from('documents')
      .select('status, current_signing_order, sent_at, expires_at, email_subject')
      .eq('id', id)
      .single();
    assertEquals(doc!.status, 'in_progress');
    assertEquals(doc!.current_signing_order, 1);
    assertEquals(doc!.email_subject, 'Please sign the lease');
    const days = (Date.parse(doc!.expires_at) - Date.parse(doc!.sent_at)) / 86_400_000;
    assert(Math.abs(days - 30) < 0.01, `default expiry 30 days, got ${days}`);

    const { data: recipients } = await admin()
      .from('document_recipients')
      .select('id, status, sent_at')
      .in('id', recipientIds)
      .order('signing_order');
    assertEquals(
      recipients!.map((r) => r.status),
      ['sent', 'pending'],
    );

    const firstInbox = await inbox(first);
    assertEquals(firstInbox.length, 1);
    assertEquals(firstInbox[0]!.Subject, 'Please sign the lease');
    assertEquals((await inbox(second)).length, 0, 'the second signer is not emailed yet');

    // The emailed link carries a token whose SHA-256 is the only thing stored.
    const text = await messageText(firstInbox[0]!.ID);
    assertMatch(text, /Thanks!\nJohn/);
    const token = /https:\/\/sign\.signflow\.test\/s\/([A-Za-z0-9_-]{43})/.exec(text)?.[1];
    assert(token, text);
    const { data: tokens } = await admin()
      .from('recipient_access_tokens')
      .select('recipient_id, token_hash, expires_at, revoked_at')
      .in('recipient_id', recipientIds);
    assertEquals(tokens!.length, 1);
    assertEquals(tokens![0]!.recipient_id, recipientIds[0]);
    assertEquals(tokens![0]!.token_hash, await hashToken(token));
    assertEquals(Date.parse(tokens![0]!.expires_at), Date.parse(doc!.expires_at));

    const types = (await events(id)).map((e) => e.type);
    assert(
      types.includes('DOCUMENT_SENT') && types.filter((t) => t === 'RECIPIENT_NOTIFIED').length === 1,
      types.join(','),
    );

    // Locked: no re-send, no field edits, no recipient changes, no title change.
    await expectCode(send(id), 'INVALID_STATE');
    const fieldEdit = await owner.client.rpc('save_document_fields', { p_document_id: id, p_fields: [] });
    assertEquals(fieldEdit.error?.code, '42501');
    const recipientEdit = await owner.client
      .from('document_recipients')
      .update({ name: 'X' })
      .eq('id', recipientIds[0]!)
      .select('id');
    assertEquals(recipientEdit.data, []);
    const titleEdit = await owner.client
      .from('documents')
      .update({ title: 'Changed' })
      .eq('id', id)
      .select('id');
    assertEquals(titleEdit.data, []);
  },
);

Deno.test('parallel signers are all notified; CC waits for completion', async () => {
  const a = mail('par-a');
  const b = mail('par-b');
  const cc = mail('par-cc');
  const { id } = await draftWith(owner, [
    { name: 'A', email: a, order: 1 },
    { name: 'B', email: b, order: 1 },
    { name: 'CC', email: cc, role: 'cc', order: 1 },
  ]);
  const result = await send(id);
  assertEquals(result.notified, 2);
  assertEquals((await inbox(a)).length, 1);
  assertEquals((await inbox(b)).length, 1);
  assertEquals((await inbox(cc)).length, 0);
  const { data } = await admin().from('document_recipients').select('role, status').eq('document_id', id);
  assertEquals(data!.find((r) => r.role === 'cc')!.status, 'pending');
});

Deno.test('recipients with an existing account are linked at send time', async () => {
  const existing = await createUser('send-existing');
  const { id, recipientIds } = await draftWith(owner, [
    { name: 'Existing', email: existing.email.toUpperCase() },
  ]);
  await send(id);
  const { data } = await admin()
    .from('document_recipients')
    .select('user_id')
    .eq('id', recipientIds[0]!)
    .single();
  assertEquals(data!.user_id, existing.id);
  // …so the document shows up for them in the app.
  const { data: visible } = await existing.client.from('documents').select('id').eq('id', id);
  assertEquals(visible!.length, 1);
});

Deno.test('only the owner can send; clients never see tokens', async () => {
  const { id } = await draftWith(owner, [{ name: 'A', email: mail('other') }]);
  const stranger = await createUser('send-stranger');
  const error = await assertRejects(
    () => sendDocument(SendDocumentInput.parse({ document_id: id }), stranger.ctx),
    HttpError,
  );
  assertEquals(error.code, 'NOT_FOUND');
  const { error: tokenError } = await owner.client.from('recipient_access_tokens').select('id');
  assertEquals(tokenError?.code, '42501');
});

Deno.test('expiry must be in the future and within a year', async () => {
  const { id } = await draftWith(owner, [{ name: 'A', email: mail('exp') }]);
  await expectCode(send(id, { expires_at: new Date(Date.now() - 1000).toISOString() }), 'INVALID_INPUT');
  await expectCode(
    send(id, { expires_at: new Date(Date.now() + 400 * 86_400_000).toISOString() }),
    'INVALID_INPUT',
  );
  const ok = await send(id, { expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() });
  assertEquals(ok.status, 'in_progress');
});
