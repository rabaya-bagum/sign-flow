import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { sha256Hex } from '../_shared/crypto.ts';
import { downloadFileName } from '../_shared/documents.ts';
import { HttpError } from '../_shared/http.ts';
import {
  admin,
  createDraft,
  createUser,
  events,
  localStatus,
  signIn,
  TEST_IP,
  uploadOriginal,
} from '../_shared/test/harness.ts';
import { fixture } from '../_shared/test/fixtures.ts';
import { getDownloadUrl } from '../get-download-url/logic.ts';
import { processUpload } from '../process-upload/logic.ts';

const owner = await createUser('dl-owner');
const bytes = fixture('pdf/portrait-3p.pdf');
const id = await createDraft(owner, 'Mutual NDA');
await uploadOriginal(owner, id, bytes);
await processUpload({ document_id: id }, owner.ctx);

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await assertRejects(() => promise as Promise<unknown>, HttpError);
  assertEquals(error.code, code);
}

/** The app rebuilds signed URLs onto its own Supabase URL (internal hosts differ locally). */
function onPublicHost(url: string): string {
  const u = new URL(url);
  return `${localStatus().API_URL}${u.pathname}${u.search}`;
}

Deno.test('owner gets a short-lived signed URL that serves the exact file', async () => {
  const result = await getDownloadUrl({ document_id: id, kind: 'original', purpose: 'download' }, owner.ctx);
  assertEquals(result.file_name, 'Mutual NDA.pdf');
  assertEquals(result.expires_in, 300);
  const res = await fetch(onPublicHost(result.url));
  assertEquals(res.status, 200);
  assert(res.headers.get('content-disposition')?.includes('Mutual NDA.pdf'));
  assertEquals(await sha256Hex(new Uint8Array(await res.arrayBuffer())), await sha256Hex(bytes));

  const downloaded = (await events(id)).filter((e) => e.type === 'DOCUMENT_DOWNLOADED');
  assertEquals(downloaded.length, 1);
  assertEquals(downloaded[0]!.ip, TEST_IP);
});

Deno.test('the download file name survives special characters exactly', async () => {
  const special = await createDraft(owner, 'Lease (unit 4) – final & signed');
  await uploadOriginal(owner, special, bytes);
  await processUpload({ document_id: special }, owner.ctx);
  const { url } = await getDownloadUrl(
    { document_id: special, kind: 'original', purpose: 'download' },
    owner.ctx,
  );
  const res = await fetch(onPublicHost(url));
  await res.body?.cancel();
  const disposition = res.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? '';
  assertEquals(decodeURIComponent(encoded), 'Lease (unit 4) – final & signed.pdf');
});

Deno.test('a signed URL with a tampered token is refused', async () => {
  const { url } = await getDownloadUrl({ document_id: id, kind: 'original', purpose: 'download' }, owner.ctx);
  const tampered = onPublicHost(url).replace(
    /token=([^&]+)/,
    (_m, t: string) => `token=${t.slice(0, -4)}AAAA`,
  );
  assertEquals((await fetch(tampered)).status >= 400, true);
});

Deno.test('strangers get NOT_FOUND (existence is not revealed)', async () => {
  const stranger = await createUser('dl-stranger');
  await expectCode(
    getDownloadUrl({ document_id: id, kind: 'original', purpose: 'download' }, stranger.ctx),
    'NOT_FOUND',
  );
});

Deno.test('seed recipients: active participant allowed, pending participant refused', async () => {
  const aaliyah = await signIn('recipient@signflow.test', 'SignFlow-dev-123');
  // Employment Agreement: her signing group is active.
  const ok = await getDownloadUrl(
    { document_id: 'a0000000-0000-4000-8000-000000000002', kind: 'original', purpose: 'download' },
    aaliyah.ctx,
  );
  assertEquals(ok.file_name, 'Employment Agreement.pdf');
  // Mutual NDA: she signs second, so the document is not visible to her yet.
  await expectCode(
    getDownloadUrl(
      { document_id: 'a0000000-0000-4000-8000-000000000001', kind: 'original', purpose: 'download' },
      aaliyah.ctx,
    ),
    'NOT_FOUND',
  );
});

Deno.test('completed copies and documents without a file are INVALID_STATE', async () => {
  await expectCode(
    getDownloadUrl({ document_id: id, kind: 'completed', purpose: 'download' }, owner.ctx),
    'INVALID_STATE',
  );
  const empty = await createDraft(owner, 'No file yet');
  await expectCode(
    getDownloadUrl({ document_id: empty, kind: 'original', purpose: 'download' }, owner.ctx),
    'INVALID_STATE',
  );
});

Deno.test('downloadFileName strips unsafe characters and adds .pdf', () => {
  assertEquals(downloadFileName('Lease: unit 4/B "final"'), 'Lease unit 4 B final.pdf');
  assertEquals(downloadFileName('report.PDF'), 'report.PDF');
  assertEquals(downloadFileName('   '), 'document.pdf');
});

Deno.test('downloadFileName keeps the certificate suffix for long titles', () => {
  const title = `${'a'.repeat(200)}.pdf`;
  const completed = downloadFileName(title, 'completed');
  const certificate = downloadFileName(title, 'certificate');
  assert(certificate.endsWith(' - certificate.pdf'), certificate);
  assert(certificate !== completed);
  assert(certificate.length <= 124, `${certificate.length}`);
  assertEquals(downloadFileName('Lease.pdf', 'certificate'), 'Lease - certificate.pdf');
});

// --- purpose: 'view' (SPEC §10) -----------------------------------------------------------------

Deno.test('view logs DOCUMENT_VIEWED once per 30 minutes, inline URL, download still logged', async () => {
  const viewer = await createUser('dl-viewer');
  const doc = await createDraft(viewer, 'Viewed doc');
  await uploadOriginal(viewer, doc, bytes);
  await processUpload({ document_id: doc }, viewer.ctx);

  const first = await getDownloadUrl({ document_id: doc, kind: 'original', purpose: 'view' }, viewer.ctx);
  assert(!first.url.includes('download='), 'view URLs are inline');
  const res = await fetch(onPublicHost(first.url));
  assertEquals(res.status, 200);
  assertEquals(await sha256Hex(new Uint8Array(await res.arrayBuffer())), await sha256Hex(bytes));

  // Re-opening (and concurrent opens) within the window add nothing.
  await Promise.all(
    Array.from({ length: 4 }, () =>
      getDownloadUrl({ document_id: doc, kind: 'original', purpose: 'view' }, viewer.ctx),
    ),
  );
  const viewed = (await events(doc)).filter((e) => e.type === 'DOCUMENT_VIEWED');
  assertEquals(viewed.length, 1);
  assertEquals(viewed[0]!.ip, TEST_IP);

  await getDownloadUrl({ document_id: doc, kind: 'original', purpose: 'download' }, viewer.ctx);
  assertEquals((await events(doc)).filter((e) => e.type === 'DOCUMENT_DOWNLOADED').length, 1);
});

Deno.test('the 30-minute window is per user and expires', async () => {
  const viewer = await createUser('dl-window');
  const doc = await createDraft(viewer, 'Window doc');
  await uploadOriginal(viewer, doc, bytes);
  await processUpload({ document_id: doc }, viewer.ctx);
  const call = (window: string) =>
    admin().rpc('log_document_view', { p_document_id: doc, p_actor_user_id: viewer.id, p_window: window });
  assertEquals((await call('30 minutes')).data, true);
  assertEquals((await call('30 minutes')).data, false);
  // Same check with an already-elapsed window: a later view is logged again.
  assertEquals((await call('0 seconds')).data, true);
});

Deno.test('viewing never changes recipient status', async () => {
  const aaliyah = await signIn('recipient@signflow.test', 'SignFlow-dev-123');
  const docId = 'a0000000-0000-4000-8000-000000000002';
  const statuses = async () => {
    const { data, error } = await admin()
      .from('document_recipients')
      .select('id, status, viewed_at, completed_at')
      .eq('document_id', docId)
      .order('id');
    if (error) throw error;
    return data;
  };
  const before = await statuses();
  assert(before.length > 0);
  await getDownloadUrl({ document_id: docId, kind: 'original', purpose: 'view' }, aaliyah.ctx);
  assertEquals(await statuses(), before);
});

Deno.test('clients cannot call log_document_view', async () => {
  const user = await createUser('dl-rpc');
  const { error } = await user.client.rpc('log_document_view', {
    p_document_id: id,
    p_actor_user_id: user.id,
  });
  assert(error, 'expected permission error');
});
