/**
 * Measures process-upload on the largest allowed input (≈25 MB, 200 pages) and a small PDF.
 * Prints wall time and RSS growth; hosted limits must be confirmed against Supabase's current docs.
 */
import { assertEquals } from 'jsr:@std/assert@1';

import { inspectPdf } from '../_shared/pdf/inspect.ts';
import { createDraft, createUser, uploadOriginal } from '../_shared/test/harness.ts';
import { fixture, imageHeavyPdf, paddedPdf } from '../_shared/test/fixtures.ts';
import { processUpload } from '../process-upload/logic.ts';

const MB = 1024 * 1024;

Deno.test('performance: inspect + process for small and 25 MB / 200-page PDFs', async () => {
  const user = await createUser('perf');
  const inputs: [string, Uint8Array][] = [
    ['small (3 pages)', fixture('pdf/portrait-3p.pdf')],
    ['large, padded (200 pages)', await paddedPdf(200, 25 * MB - 300_000)],
    // ~120 KB distinct image per page: closer to a real scanned contract.
    ['large, image per page (200 pages)', await imageHeavyPdf(200, 196)],
  ];
  const rows: string[] = [];
  for (const [label, bytes] of inputs) {
    const rss0 = Deno.memoryUsage().rss;
    const t0 = performance.now();
    const info = await inspectPdf(bytes);
    const inspectMs = performance.now() - t0;

    const id = await createDraft(user, label);
    const { error } = await uploadOriginal(user, id, bytes);
    if (error) throw error;
    const t1 = performance.now();
    const result = await processUpload({ document_id: id }, user.ctx);
    const processMs = performance.now() - t1;
    const rssGrowth = (Deno.memoryUsage().rss - rss0) / MB;

    assertEquals(result.page_count, info.pageCount);
    rows.push(
      `${label}: ${(bytes.length / MB).toFixed(2)} MB, ${info.pageCount} pages | parse ${inspectMs.toFixed(0)} ms | ` +
        `process-upload end-to-end ${processMs.toFixed(0)} ms | RSS +${rssGrowth.toFixed(0)} MB`,
    );
  }
  console.log('\n' + rows.join('\n'));
});
