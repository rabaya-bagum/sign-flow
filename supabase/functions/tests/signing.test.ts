import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';

import { ESIGN_DISCLOSURE_VERSION } from '../../../shared/legal.ts';
import type { SigningSession } from '../../../shared/signing.ts';
import { bytesToBase64, sha256Hex } from '../_shared/crypto.ts';
import { HttpError } from '../_shared/http.ts';
import {
  decline,
  DeclineInput,
  esignConsent,
  guestConsent,
  guestDecline,
  guestDownloadHandler,
  GuestDownloadInput,
  guestOpen,
  guestOtp,
  guestSubmit,
  GuestSubmitInput,
  signingSession,
  submitSigningHandler,
  SubmitSigningInput,
} from '../_shared/signingHandlers.ts';
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
import { getDownloadUrl, GetDownloadUrlInput } from '../get-download-url/logic.ts';
import { processUpload } from '../process-upload/logic.ts';
import { sendDocument, SendDocumentInput } from '../send-document/logic.ts';

const MAILPIT = 'http://127.0.0.1:54324';
Deno.env.set('MAILPIT_API_URL', MAILPIT);
Deno.env.set('PUBLIC_SIGNING_URL', 'https://sign.signflow.test');

const unique = crypto.randomUUID().slice(0, 8);
const mail = (label: string) => `${label}.${unique}@signing.test`;
const guestReq = () => ({ admin: admin(), ip: TEST_IP, userAgent: TEST_UA });
const signature = bytesToBase64(
  await rgbPng(300, 100, (x, y) =>
    Math.abs(y - 50 - 20 * Math.sin(x / 20)) < 4 ? [20, 30, 90] : [255, 255, 255],
  ),
);

// --- Mailpit -----------------------------------------------------------------------------------------
interface MailSummary {
  ID: string;
  Subject: string;
}
async function inbox(email: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return (await res.json()).messages ?? [];
}
async function message(id: string) {
  return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text: string;
    Attachments: { PartID: string; FileName: string; ContentType: string }[];
  };
}
async function attachment(id: string, partId: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(`${MAILPIT}/api/v1/message/${id}/part/${partId}`)).arrayBuffer());
}
/** The token from the newest email to this address that carries a signing link. */
async function linkToken(email: string): Promise<string> {
  for (const item of await inbox(email)) {
    const match = (await message(item.ID)).Text.match(/\/s\/([A-Za-z0-9_-]{43})/);
    if (match) return match[1]!;
  }
  throw new Error(`no signing link emailed to ${email}`);
}

// --- PDF text (certificate check): inflate content streams and read the Tj strings -------------------
async function pdfText(bytes: Uint8Array): Promise<string> {
  const latin1 = new TextDecoder('latin1').decode(bytes);
  let text = '';
  for (const m of latin1.matchAll(/\/Length (\d+)[^>]*>>\s*stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const raw = bytes.slice(start, start + Number(m[1]));
    let content: string;
    try {
      const inflated = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
      content = new TextDecoder('latin1').decode(await new Response(inflated).arrayBuffer());
    } catch {
      content = new TextDecoder('latin1').decode(raw);
    }
    for (const t of content.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      text += t[1]!.replace(/../g, (h) => String.fromCharCode(parseInt(h, 16))) + '\n';
    }
  }
  return text;
}

// --- Drafts ------------------------------------------------------------------------------------------
interface RecipientSpec {
  name: string;
  email: string;
  role?: 'signer' | 'approver' | 'viewer' | 'cc';
  order?: number;
  fields?: { type: string; required?: boolean; properties?: Record<string, unknown> }[];
}

async function sentDocument(
  owner: TestUser,
  recipients: RecipientSpec[],
  options: Record<string, unknown> = {},
) {
  const id = await createDraft(owner, `Signing ${crypto.randomUUID().slice(0, 4)}`);
  await uploadOriginal(owner, id, fixture('pdf/rotated-90.pdf'));
  await processUpload({ document_id: id }, owner.ctx);
  const ids: Record<string, string> = {};
  const fields: Record<string, unknown>[] = [];
  const fieldIds: Record<string, string[]> = {};
  for (const r of recipients) {
    const { data, error } = await owner.client
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
    ids[r.email] = data.id;
    fieldIds[r.email] = [];
    for (const f of r.fields ?? (r.role && r.role !== 'signer' ? [] : [{ type: 'signature' }])) {
      const fieldId = crypto.randomUUID();
      fieldIds[r.email]!.push(fieldId);
      fields.push({
        id: fieldId,
        recipient_id: data.id,
        page_number: 1,
        type: f.type,
        x: 0.1,
        y: 0.05 + fields.length * 0.12,
        width: f.type === 'checkbox' ? 0.04 : 0.4,
        height: f.type === 'checkbox' ? 0.04 : 0.08,
        required: f.required ?? true,
        properties: f.properties ?? {},
      });
    }
  }
  const { error } = await owner.client.rpc('save_document_fields', { p_document_id: id, p_fields: fields });
  if (error) throw error;
  await sendDocument(SendDocumentInput.parse({ document_id: id, ...options }), owner.ctx);
  return { id, ids, fieldIds };
}

async function expectCode(promise: Promise<unknown>, code: string, pattern?: RegExp) {
  const error = await assertRejects(() => promise as Promise<unknown>, HttpError);
  assertEquals(error.code, code, error.message);
  if (pattern) assertMatch(error.message, pattern);
}

const owner = await createUser('sign-owner');

Deno.test(
  'owner (in-app) + guest + CC complete a document; everyone gets the signed PDF and certificate; hashes match (P6 done-when)',
  async () => {
    const guest = mail('guest');
    const cc = mail('cc');
    const textProps = { fontSize: 12, align: 'left', validation: 'none' };
    const { id, fieldIds } = await sentDocument(owner, [
      {
        name: 'Owner Signer',
        email: owner.email,
        order: 1,
        fields: [{ type: 'signature' }, { type: 'full_name', properties: { fontSize: 12, align: 'left' } }],
      },
      {
        name: 'Grace Guest',
        email: guest,
        order: 2,
        fields: [
          { type: 'signature' },
          { type: 'text', properties: textProps },
          { type: 'date_signed', properties: { format: 'yyyy-MM-dd' } },
          { type: 'checkbox', required: false },
        ],
      },
      { name: 'Carl Copy', email: cc, role: 'cc', order: 2 },
    ]);

    // 1. The owner is linked at send time and signs in the app.
    const ownerSession = (await signingSession({ document_id: id }, owner.ctx)) as SigningSession;
    assertEquals(ownerSession.state, 'sign');
    assertEquals(ownerSession.consent_required, true);
    assertEquals(ownerSession.fields.length, 2);
    assert(ownerSession.pdf_url);
    await expectCode(
      submitSigningHandler(SubmitSigningInput.parse({ document_id: id, values: [] }), owner.ctx),
      'INVALID_STATE',
      /Agree/,
    );
    await esignConsent({ document_id: id, disclosure_version: ESIGN_DISCLOSURE_VERSION }, owner.ctx);
    const [ownerSig, ownerName] = fieldIds[owner.email]!;
    await expectCode(
      submitSigningHandler(
        SubmitSigningInput.parse({
          document_id: id,
          values: [{ field_id: ownerName, value: 'Owner Signer' }],
        }),
        owner.ctx,
      ),
      'INVALID_INPUT',
    );
    const first = await submitSigningHandler(
      SubmitSigningInput.parse({
        document_id: id,
        values: [
          { field_id: ownerSig, asset: 'sig' },
          { field_id: ownerName, value: 'Owner Signer' },
        ],
        assets: { sig: signature },
      }),
      owner.ctx,
    );
    assertEquals(first.outcome, 'advanced');
    assertEquals((await inbox(cc)).length, 0, 'the CC is not emailed before completion');

    // 2. The guest gets a link, consents and signs on the web.
    const token = await linkToken(guest);
    const open = (await guestOpen({ token }, guestReq())) as SigningSession;
    assertEquals(open.state, 'sign');
    assertEquals(open.recipient.status, 'viewed');
    assertEquals(open.filled.length, 2, "the guest sees the owner's filled fields");
    assert(open.filled.some((f) => f.image?.startsWith('data:image/png;base64,')));
    assert(open.filled.some((f) => f.text === 'Owner Signer'));
    await guestConsent({ token, disclosure_version: ESIGN_DISCLOSURE_VERSION }, guestReq());
    const [gSig, gText, gDate, gBox] = fieldIds[guest]!;
    const done = await guestSubmit(
      GuestSubmitInput.parse({
        token,
        values: [
          { field_id: gSig, asset: 'a' },
          { field_id: gText, value: 'Approved for Q4' },
          { field_id: gDate, value: 'ignored' },
          { field_id: gBox, value: 'true' },
        ],
        assets: { a: signature },
        timezone: 'Asia/Dhaka',
      }),
      guestReq(),
    );
    assertEquals(done.outcome, 'completed');
    assert(done.download_token);

    // 3. Completed: files stored, hashes recorded, links revoked.
    const { data: doc } = await admin()
      .from('documents')
      .select('status, completed_path, certificate_path, completed_sha256, original_sha256, completed_at')
      .eq('id', id)
      .single();
    assertEquals(doc!.status, 'completed');
    const completed = new Uint8Array(
      await (await admin().storage.from('documents').download(doc!.completed_path!)).data!.arrayBuffer(),
    );
    const certificate = new Uint8Array(
      await (await admin().storage.from('documents').download(doc!.certificate_path!)).data!.arrayBuffer(),
    );
    assertEquals(await sha256Hex(completed), doc!.completed_sha256);
    const certText = await pdfText(certificate);
    assert(certText.includes(doc!.completed_sha256!), 'certificate shows the completed hash');
    assert(certText.includes(doc!.original_sha256!), 'certificate shows the original hash');
    for (const expected of [
      'Certificate of completion',
      'Grace Guest',
      'Carl Copy',
      'Email link',
      'SignFlow account',
      ESIGN_DISCLOSURE_VERSION,
      TEST_IP,
    ]) {
      assert(certText.includes(expected), `certificate mentions ${expected}`);
    }
    const completedText = await pdfText(completed);
    assert(completedText.includes('Approved for Q4'), 'text value flattened');
    assert(completedText.includes('Owner Signer'), 'name flattened');
    assertMatch(completedText, /\d{4}-\d{2}-\d{2}/, 'date flattened in the requested format');

    const { data: values } = await admin()
      .from('field_values')
      .select('field_id, value')
      .eq('document_id', id);
    assertEquals(values!.length, 6);
    const { data: cc_row } = await admin()
      .from('document_recipients')
      .select('status')
      .eq('email', cc)
      .single();
    assertEquals(cc_row!.status, 'sent');
    const reopened = (await guestOpen({ token }, guestReq())) as SigningSession;
    assertEquals(reopened.state, 'completed');
    assertEquals(reopened.can_download, false, 'the signing link no longer downloads');

    // 4. Everyone, the CC included, receives both PDFs; the attached files match the certificate's hashes.
    for (const email of [owner.email, guest, cc]) {
      const mailItem = (await inbox(email)).find((m) => m.Subject.startsWith('Completed:'));
      assert(mailItem, `completion email to ${email}`);
      const full = await message(mailItem.ID);
      assertEquals(full.Attachments.length, 2, `two attachments for ${email}`);
      const signed = full.Attachments.find((a) => !a.FileName.includes('certificate'))!;
      assertEquals(await sha256Hex(await attachment(mailItem.ID, signed.PartID)), doc!.completed_sha256);
      if (email !== owner.email)
        assertMatch(full.Text, /\/s\/[A-Za-z0-9_-]{43}/, 'guests get a download link');
    }

    // The owner downloads the signed copy in the app.
    const ownerCopy = await getDownloadUrl(
      GetDownloadUrlInput.parse({ document_id: id, kind: 'completed' }),
      owner.ctx,
    );
    assertEquals(
      await sha256Hex(new Uint8Array(await (await fetch(ownerCopy.url)).arrayBuffer())),
      doc!.completed_sha256,
    );

    // 5. The CC's download link fetches the signed copy and certificate.
    const ccToken = await linkToken(cc);
    const ccOpen = (await guestOpen({ token: ccToken }, guestReq())) as SigningSession;
    assertEquals([ccOpen.state, ccOpen.can_download], ['completed', true]);
    const url = await guestDownloadHandler(
      GuestDownloadInput.parse({ token: ccToken, kind: 'certificate' }),
      guestReq(),
    );
    assertMatch(url.file_name, /certificate\.pdf$/);
    const fetched = new Uint8Array(await (await fetch(url.url)).arrayBuffer());
    assertEquals(await sha256Hex(fetched), await sha256Hex(certificate));
    await expectCode(
      guestDownloadHandler(GuestDownloadInput.parse({ token, kind: 'completed' }), guestReq()),
      'FORBIDDEN',
    );

    const { data: log } = await admin()
      .from('document_events')
      .select('type, actor_recipient_id, ip')
      .eq('document_id', id)
      .order('id');
    const types = log!.map((e) => e.type);
    for (const t of [
      'ESIGN_CONSENT_ACCEPTED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_SIGNED',
      'DOCUMENT_COMPLETED',
      'DOCUMENT_DOWNLOADED',
    ]) {
      assert(types.includes(t), `event ${t}`);
    }
    const guestSigned = log!.find(
      (e) => e.type === 'DOCUMENT_SIGNED' && e.ip === TEST_IP && e.actor_recipient_id,
    );
    assert(guestSigned, 'guest signature event carries the recipient and IP');
  },
);

Deno.test('signing links: invalid, replaced, expired; not your turn; strangers', async () => {
  await expectCode(guestOpen({ token: 'short' }, guestReq()), 'LINK_INVALID');
  await expectCode(guestOpen({ token: 'A'.repeat(43) }, guestReq()), 'LINK_INVALID');

  const signer = mail('turn1');
  const second = await createUser('sign-second');
  const { id, ids } = await sentDocument(owner, [
    { name: 'One', email: signer, order: 1 },
    { name: 'Two', email: second.email, order: 2 },
  ]);
  const session = (await signingSession({ document_id: id }, second.ctx)) as SigningSession;
  assertEquals(session.state, 'not_your_turn');
  assertEquals(session.waiting_for, ['One']);
  assertEquals(session.pdf_url, null, 'no content before your turn');
  await expectCode(
    submitSigningHandler(SubmitSigningInput.parse({ document_id: id, values: [] }), second.ctx),
    'NOT_YOUR_TURN',
  );
  const stranger = await createUser('sign-stranger');
  await expectCode(signingSession({ document_id: id }, stranger.ctx), 'NOT_FOUND');

  const token = await linkToken(signer);
  await admin()
    .from('recipient_access_tokens')
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('recipient_id', ids[signer]);
  await expectCode(guestOpen({ token }, guestReq()), 'LINK_EXPIRED');
  await admin()
    .from('recipient_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('recipient_id', ids[signer]);
  await expectCode(guestOpen({ token }, guestReq()), 'LINK_INVALID', /replaced/);
});

Deno.test('invalid submissions are refused and nothing is stored', async () => {
  const guest = mail('invalid');
  const { id, fieldIds } = await sentDocument(owner, [
    {
      name: 'Val',
      email: guest,
      fields: [{ type: 'signature' }, { type: 'email', properties: { fontSize: 12, align: 'left' } }],
    },
  ]);
  const token = await linkToken(guest);
  await guestConsent({ token, disclosure_version: ESIGN_DISCLOSURE_VERSION }, guestReq());
  await expectCode(guestConsent({ token, disclosure_version: '1999-01-01' }, guestReq()), 'INVALID_STATE');
  const [sig, email] = fieldIds[guest]!;
  const submit = (values: unknown[], assets: Record<string, string> = {}) =>
    guestSubmit(GuestSubmitInput.parse({ token, values, assets }), guestReq());
  await expectCode(
    submit(
      [
        { field_id: sig, asset: 'a' },
        { field_id: email, value: 'nope' },
      ],
      { a: signature },
    ),
    'INVALID_INPUT',
  );
  await expectCode(submit([{ field_id: email, value: 'val@example.com' }]), 'INVALID_INPUT');
  await expectCode(
    submit(
      [
        { field_id: sig, asset: 'a' },
        { field_id: email, value: 'val@example.com' },
      ],
      { a: btoa('not a png') },
    ),
    'INVALID_INPUT',
    /PNG/,
  );
  await expectCode(
    submit(
      [
        { field_id: sig, asset: 'a' },
        { field_id: email, value: 'val@example.com' },
        { field_id: crypto.randomUUID(), value: 'x' },
      ],
      { a: signature },
    ),
    'INVALID_INPUT',
  );
  const { count } = await admin()
    .from('field_values')
    .select('field_id', { count: 'exact', head: true })
    .eq('document_id', id);
  assertEquals(count, 0);
  const { data: files } = await admin().storage.from('documents').list(`${owner.id}/${id}/signing`);
  assertEquals(files?.length ?? 0, 0, 'no orphaned signature images');
});

Deno.test('a guest declines: the document ends, the owner is emailed, the link shows declined', async () => {
  const guest = mail('decliner');
  const other = mail('parallel');
  const { id } = await sentDocument(owner, [
    { name: 'Dee Cliner', email: guest },
    { name: 'Para Llel', email: other },
  ]);
  const token = await linkToken(guest);
  await expectCode(guestDecline({ token, reason: '' }, guestReq()), 'INVALID_INPUT');
  await guestDecline({ token, reason: 'The amount is wrong' }, guestReq());
  const { data: doc } = await admin().from('documents').select('status').eq('id', id).single();
  assertEquals(doc!.status, 'declined');
  const ownerMail = (await inbox(owner.email)).find((m) => m.Subject.startsWith('Declined:'));
  assert(ownerMail, 'owner emailed');
  assertMatch((await message(ownerMail.ID)).Text, /The amount is wrong/);
  assert(
    (await inbox(other)).some((m) => m.Subject.startsWith('Declined:')),
    'other active signer emailed',
  );
  assertEquals(((await guestOpen({ token }, guestReq())) as SigningSession).state, 'declined');
  await expectCode(guestSubmit(GuestSubmitInput.parse({ token, values: [] }), guestReq()), 'INVALID_STATE');
  const otherToken = await linkToken(other);
  assertEquals(((await guestOpen({ token: otherToken }, guestReq())) as SigningSession).state, 'declined');
});

Deno.test('declining can be disabled; in-app decline works for linked signers', async () => {
  const linked = await createUser('sign-decline-linked');
  const { id } = await sentDocument(owner, [{ name: 'Linked', email: linked.email }], {
    allow_decline: false,
  });
  await expectCode(
    decline(DeclineInput.parse({ document_id: id, reason: 'No' }), linked.ctx),
    'INVALID_STATE',
  );
  const { id: id2 } = await sentDocument(owner, [{ name: 'Linked', email: linked.email }]);
  await decline(DeclineInput.parse({ document_id: id2, reason: 'Not mine' }), linked.ctx);
  const { data } = await admin()
    .from('document_recipients')
    .select('status, decline_reason')
    .eq('document_id', id2)
    .single();
  assertEquals(data, { status: 'declined', decline_reason: 'Not mine' });
});

Deno.test('email one-time code gates the link when required', async () => {
  const guest = mail('otp');
  const { id } = await sentDocument(owner, [{ name: 'Otto', email: guest }], { require_email_otp: true });
  const token = await linkToken(guest);
  const locked = (await guestOpen({ token }, guestReq())) as SigningSession;
  assertEquals(locked.state, 'otp_required');
  assertEquals(locked.pdf_url, null);
  assertEquals(locked.fields.length, 0);
  assertMatch(locked.masked_email!, /^o•+@signing\.test$/);
  await expectCode(
    guestConsent({ token, disclosure_version: ESIGN_DISCLOSURE_VERSION }, guestReq()),
    'OTP_REQUIRED',
  );
  await expectCode(
    guestDownloadHandler(GuestDownloadInput.parse({ token, kind: 'original' }), guestReq()),
    'FORBIDDEN',
  );

  await guestOtp({ token, action: 'request' }, guestReq());
  await expectCode(guestOtp({ token, action: 'request' }, guestReq()), 'RATE_LIMITED');
  const codeMail = (await inbox(guest)).find((m) => m.Subject.startsWith('Your SignFlow code'))!;
  const code = codeMail.Subject.match(/(\d{6})/)![1]!;
  const wrong = code === '000000' ? '111111' : '000000';
  await expectCode(guestOtp({ token, action: 'verify', code: wrong }, guestReq()), 'OTP_INVALID');
  await guestOtp({ token, action: 'verify', code }, guestReq());
  const open = (await guestOpen({ token }, guestReq())) as SigningSession;
  assertEquals(open.state, 'sign');
  assert(open.pdf_url);
  const { data: log } = await admin().from('document_events').select('type').eq('document_id', id);
  assert(log!.some((e) => e.type === 'OTP_VERIFIED'));
});

Deno.test(
  'approvers approve without fields; viewers never block; parallel signers wait for each other',
  async () => {
    const a = mail('par-a');
    const b = mail('par-b');
    const approver = mail('approver');
    const viewer = mail('viewer');
    const { id } = await sentDocument(owner, [
      { name: 'Par A', email: a, order: 1 },
      { name: 'Par B', email: b, order: 1 },
      { name: 'View Er', email: viewer, role: 'viewer', order: 1 },
      { name: 'Appro Ver', email: approver, role: 'approver', order: 2 },
    ]);
    const viewerToken = await linkToken(viewer);
    const viewSession = (await guestOpen({ token: viewerToken }, guestReq())) as SigningSession;
    assertEquals(
      [viewSession.state, viewSession.consent_required, viewSession.fields.length],
      ['view', false, 0],
    );

    const signAs = async (email: string) => {
      const token = await linkToken(email);
      const session = (await guestOpen({ token }, guestReq())) as SigningSession;
      await guestConsent({ token, disclosure_version: ESIGN_DISCLOSURE_VERSION }, guestReq());
      return guestSubmit(
        GuestSubmitInput.parse({
          token,
          values: session.fields.map((f) => ({ field_id: f.id, asset: 's' })),
          assets: session.fields.length ? { s: signature } : {},
        }),
        guestReq(),
      );
    };
    assertEquals((await signAs(a)).outcome, 'waiting');
    assertEquals((await inbox(approver)).length, 0, 'the approver waits for both parallel signers');
    assertEquals((await signAs(b)).outcome, 'advanced');
    const approved = await signAs(approver);
    assertEquals(approved.outcome, 'completed');
    const { data: rows } = await admin()
      .from('document_recipients')
      .select('email, status')
      .eq('document_id', id);
    const status = Object.fromEntries(rows!.map((r) => [r.email, r.status]));
    assertEquals(status[approver], 'approved');
    assertEquals(status[viewer], 'viewed');
  },
);
