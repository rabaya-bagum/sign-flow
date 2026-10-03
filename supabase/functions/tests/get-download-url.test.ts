import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { sha256Hex } from '../_shared/crypto.ts';
import { HttpError } from '../_shared/http.ts';
import {
  createDraft,
  createUser,
  events,
  localStatus,
  signIn,
  TEST_IP,
  uploadOriginal,
} from '../_shared/test/harness.ts';
import { fixture } from '../_shared/test/fixtures.ts';
import { downloadFileName, getDownloadUrl } from '../get-download-url/logic.ts';
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
  const result = await getDownloadUrl({ document_id: id, kind: 'original' }, owner.ctx);
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

Deno.test('a signed URL with a tampered token is refused', async () => {
  const { url } = await getDownloadUrl({ document_id: id, kind: 'original' }, owner.ctx);
  const tampered = onPublicHost(url).replace(
    /token=([^&]+)/,
    (_m, t: string) => `token=${t.slice(0, -4)}AAAA`,
  );
  assertEquals((await fetch(tampered)).status >= 400, true);
});

Deno.test('strangers get NOT_FOUND (existence is not revealed)', async () => {
  const stranger = await createUser('dl-stranger');
  await expectCode(getDownloadUrl({ document_id: id, kind: 'original' }, stranger.ctx), 'NOT_FOUND');
});

Deno.test('seed recipients: active participant allowed, pending participant refused', async () => {
  const aaliyah = await signIn('recipient@signflow.test', 'SignFlow-dev-123');
  // Employment Agreement: her signing group is active.
  const ok = await getDownloadUrl(
    { document_id: 'a0000000-0000-4000-8000-000000000002', kind: 'original' },
    aaliyah.ctx,
  );
  assertEquals(ok.file_name, 'Employment Agreement.pdf');
  // Mutual NDA: she signs second, so the document is not visible to her yet.
  await expectCode(
    getDownloadUrl({ document_id: 'a0000000-0000-4000-8000-000000000001', kind: 'original' }, aaliyah.ctx),
    'NOT_FOUND',
  );
});

Deno.test('completed copies and documents without a file are INVALID_STATE', async () => {
  await expectCode(getDownloadUrl({ document_id: id, kind: 'completed' }, owner.ctx), 'INVALID_STATE');
  const empty = await createDraft(owner, 'No file yet');
  await expectCode(getDownloadUrl({ document_id: empty, kind: 'original' }, owner.ctx), 'INVALID_STATE');
});

Deno.test('downloadFileName strips unsafe characters and adds .pdf', () => {
  assertEquals(downloadFileName('Lease: unit 4/B "final"'), 'Lease unit 4 B final.pdf');
  assertEquals(downloadFileName('report.PDF'), 'report.PDF');
  assertEquals(downloadFileName('   '), 'document.pdf');
});
