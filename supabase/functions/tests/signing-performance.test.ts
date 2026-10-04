/**
 * Phase 8 performance: the whole signing path on the largest allowed document (200 pages, ~22 MB,
 * one image per page). Prints wall and CPU time per step; hosted Edge Function limits (wall clock,
 * CPU time, memory) must be compared against Supabase's current documentation.
 */
import process from 'node:process';

import { assert, assertEquals } from 'jsr:@std/assert@1';

import type { SigningSession } from '../../../shared/signing.ts';
import { ESIGN_DISCLOSURE_VERSION } from '../../../shared/legal.ts';
import { bytesToBase64 } from '../_shared/crypto.ts';
import { guestConsent, guestOpen, guestSubmit, GuestSubmitInput } from '../_shared/signingHandlers.ts';
import { admin, createDraft, createUser, TEST_IP, TEST_UA, uploadOriginal } from '../_shared/test/harness.ts';
import { imageHeavyPdf, rgbPng } from '../_shared/test/fixtures.ts';
import { processUpload } from '../process-upload/logic.ts';
import { sendDocument, SendDocumentInput } from '../send-document/logic.ts';

const MAILPIT = 'http://127.0.0.1:54324';
Deno.env.set('MAILPIT_API_URL', MAILPIT);
Deno.env.set('PUBLIC_SIGNING_URL', 'https://sign.signflow.test');
const MB = 1024 * 1024;

async function measure<T>(rows: string[], label: string, step: () => Promise<T>): Promise<T> {
  const cpu0 = process.cpuUsage();
  const rss0 = Deno.memoryUsage().rss;
  const t0 = performance.now();
  const result = await step();
  const wall = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  rows.push(
    `${label.padEnd(28)} wall ${wall.toFixed(0).padStart(6)} ms | CPU ${((cpu.user + cpu.system) / 1000)
      .toFixed(0)
      .padStart(6)} ms | RSS +${((Deno.memoryUsage().rss - rss0) / MB).toFixed(0)} MB`,
  );
  return result;
}

Deno.test({
  name: 'performance: send, open, sign and finalize a 200-page document',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const rows: string[] = [];
    const owner = await createUser('perf-sign');
    const guest = `perf-guest.${crypto.randomUUID().slice(0, 8)}@perf.test`;
    const bytes = await imageHeavyPdf(200, 196);

    const id = await createDraft(owner, 'Two hundred pages');
    await measure(rows, `upload (${(bytes.length / MB).toFixed(1)} MB)`, async () => {
      const { error } = await uploadOriginal(owner, id, bytes);
      if (error) throw error;
    });
    await measure(rows, 'process-upload', () => processUpload({ document_id: id }, owner.ctx));

    const { data: rec } = await owner.client
      .from('document_recipients')
      .insert({ document_id: id, name: 'Pat Perf', email: guest, signing_order: 1 })
      .select('id')
      .single();
    const field = (page: number, type: string, y: number) => ({
      id: crypto.randomUUID(),
      recipient_id: rec!.id,
      page_number: page,
      type,
      x: 0.1,
      y,
      width: type === 'signature' ? 0.3 : 0.2,
      height: 0.05,
      required: true,
      properties: {},
    });
    await owner.client.rpc('save_document_fields', {
      p_document_id: id,
      p_fields: [field(1, 'signature', 0.8), field(100, 'text', 0.5), field(200, 'signature', 0.8)],
    });
    await measure(rows, 'send-document', () =>
      sendDocument(SendDocumentInput.parse({ document_id: id }), owner.ctx),
    );

    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${guest}`)}`);
    const [message] = (await res.json()).messages;
    const text = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()).Text as string;
    const token = text.match(/\/s\/([A-Za-z0-9_-]{43})/)![1]!;
    const req = { admin: admin(), ip: TEST_IP, userAgent: TEST_UA };

    const session = (await measure(rows, 'guest-open', () => guestOpen({ token }, req))) as SigningSession;
    assertEquals(session.fields.length, 3);
    await guestConsent({ token, disclosure_version: ESIGN_DISCLOSURE_VERSION }, req);
    const png = bytesToBase64(await rgbPng(240, 80, (x, y) => ((x + y) % 9 ? [255, 255, 255] : [0, 0, 0])));
    await measure(rows, 'guest-submit + finalize', () =>
      guestSubmit(
        GuestSubmitInput.parse({
          token,
          values: session.fields.map((f) =>
            f.type === 'text'
              ? { field_id: f.id, value: 'Page 100 initialled' }
              : { field_id: f.id, asset: 's' },
          ),
          assets: { s: png },
        }),
        req,
      ),
    );

    const { data: doc } = await admin()
      .from('documents')
      .select('status, completed_path, certificate_path, completed_sha256')
      .eq('id', id)
      .single();
    assertEquals(doc!.status, 'completed');
    assert(doc!.completed_path && doc!.certificate_path && doc!.completed_sha256);
    console.log('\n' + rows.join('\n'));
  },
});
