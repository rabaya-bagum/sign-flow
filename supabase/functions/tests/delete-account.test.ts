import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { createClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';
import {
  admin,
  createDraft,
  createUser,
  localStatus,
  storageHas,
  type TestUser,
  uploadOriginal,
} from '../_shared/test/harness.ts';
import { fixture } from '../_shared/test/fixtures.ts';
import { deleteAccount, DeleteAccountInput, VOID_REASON } from '../delete-account/logic.ts';
import { processUpload } from '../process-upload/logic.ts';
import { sendDocument, SendDocumentInput } from '../send-document/logic.ts';

const MAILPIT = 'http://127.0.0.1:54324';
Deno.env.set('MAILPIT_API_URL', MAILPIT);
Deno.env.set('PUBLIC_SIGNING_URL', 'https://sign.signflow.test');
const PASSWORD = 'function-test-pass1';
const unique = crypto.randomUUID().slice(0, 8);

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await assertRejects(() => promise, HttpError);
  assertEquals(error.code, code, error.message);
}

async function sentTo(owner: TestUser, name: string, email: string) {
  const id = await createDraft(owner, `Account ${crypto.randomUUID().slice(0, 4)}`);
  await uploadOriginal(owner, id, fixture('pdf/portrait-3p.pdf'));
  await processUpload({ document_id: id }, owner.ctx);
  const { data: rec } = await owner.client
    .from('document_recipients')
    .insert({ document_id: id, name, email, signing_order: 1 })
    .select('id')
    .single();
  await owner.client.rpc('save_document_fields', {
    p_document_id: id,
    p_fields: [
      {
        id: crypto.randomUUID(),
        recipient_id: rec!.id,
        page_number: 1,
        type: 'signature',
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.05,
        required: true,
        properties: {},
      },
    ],
  });
  await sendDocument(SendDocumentInput.parse({ document_id: id }), owner.ctx);
  return { id, recipientId: rec!.id as string };
}

Deno.test({
  name: 'delete-account requires the password',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const user = await createUser('del-reauth');
    await expectCode(deleteAccount(DeleteAccountInput.parse({}), user.ctx), 'REAUTH_REQUIRED');
    await expectCode(
      deleteAccount(DeleteAccountInput.parse({ password: 'not-the-password' }), user.ctx),
      'INVALID_CREDENTIALS',
    );
    const { data } = await admin().from('profiles').select('deleted_at').eq('id', user.id).single();
    assertEquals(data!.deleted_at, null);
  },
});

Deno.test({
  name: 'delete-account removes own data, voids documents in progress, keeps records for others',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const user = await createUser('del-user');
    const other = await createUser('del-other');
    const guestEmail = `del-guest.${unique}@account.test`;

    // Own data: a draft with its file, a saved-signature image, an avatar, a phone number, a push token.
    const draft = await createDraft(user, 'My draft');
    await uploadOriginal(user, draft, fixture('pdf/portrait-3p.pdf'));
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    await admin().storage.from('signatures').upload(`${user.id}/${crypto.randomUUID()}.png`, png, {
      contentType: 'image/png',
    });
    await admin().storage.from('avatars').upload(`${user.id}/avatar.jpg`, png, { contentType: 'image/jpeg' });
    await admin()
      .from('profiles')
      .update({ phone: '+15550100', avatar_path: `${user.id}/avatar.jpg` })
      .eq('id', user.id);
    const { error: tokenInsert } = await admin()
      .from('push_tokens')
      .insert({ user_id: user.id, expo_push_token: `ExponentPushToken[del-${unique}]`, platform: 'ios' });
    assert(!tokenInsert, tokenInsert?.message);

    // A document in progress with a guest, and a document someone else sent to this user.
    const outgoing = await sentTo(user, 'Gail Guest', guestEmail);
    const incoming = await sentTo(other, 'Del User', user.email);
    const { data: linked } = await admin()
      .from('document_recipients')
      .select('user_id')
      .eq('id', incoming.recipientId)
      .single();
    assertEquals(linked!.user_id, user.id, 'precondition: the incoming request is linked to the account');

    const result = await deleteAccount(DeleteAccountInput.parse({ password: PASSWORD }), user.ctx);
    assertEquals(result.deleted, true);

    // Own data is gone.
    const db = admin();
    const { data: draftRow } = await db.from('documents').select('deleted_at').eq('id', draft).single();
    assert(draftRow!.deleted_at, 'draft soft-deleted');
    assertEquals(await storageHas('documents', `${user.id}/${draft}/original.pdf`), false);
    assertEquals((await db.storage.from('signatures').list(user.id)).data?.length ?? 0, 0);
    assertEquals(await storageHas('avatars', `${user.id}/avatar.jpg`), false);
    assertEquals((await db.from('push_tokens').select('id').eq('user_id', user.id)).data?.length, 0);

    // The profile is a tombstone: name and email kept for other people's records, nothing else.
    const { data: profile } = await db
      .from('profiles')
      .select('full_name, email, phone, avatar_path, deleted_at')
      .eq('id', user.id)
      .single();
    assert(profile!.deleted_at);
    assertEquals(profile!.email, user.email);
    assertEquals(profile!.full_name, 'Test del-user');
    assertEquals(profile!.phone, null);
    assertEquals(profile!.avatar_path, null);

    // The document in progress is voided, its file kept for the guest's record, and the guest told.
    const { data: voided } = await db
      .from('documents')
      .select('status, void_reason, deleted_at')
      .eq('id', outgoing.id)
      .single();
    assertEquals(voided, { status: 'voided', void_reason: VOID_REASON, deleted_at: null });
    assert(await storageHas('documents', `${user.id}/${outgoing.id}/original.pdf`));
    const mails = await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${guestEmail}`)}`)
    ).json();
    assert(
      (mails.messages ?? []).some((m: { Subject: string }) => m.Subject.startsWith('Cancelled:')),
      'guest told',
    );

    // The request from someone else stays with them, unlinked from the deleted account.
    const { data: incomingRec } = await db
      .from('document_recipients')
      .select('user_id, email')
      .eq('id', incoming.recipientId)
      .single();
    assertEquals(incomingRec!.user_id, null);
    assertEquals(incomingRec!.email, user.email);

    // Signed out everywhere and unable to sign in again.
    const s = localStatus();
    const fresh = createClient(s.API_URL, s.ANON_KEY, { auth: { persistSession: false } });
    const { error: signInError } = await fresh.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    assert(signInError, 'sign-in refused');
    const { error: tokenError } = await db.auth.getUser(user.token);
    assert(tokenError, 'old session revoked');

    // The same email can sign up again as a new, unrelated account.
    const { data: again, error: againError } = await db.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
    });
    assert(!againError, againError?.message);
    assert(again.user && again.user.id !== user.id);
  },
});
