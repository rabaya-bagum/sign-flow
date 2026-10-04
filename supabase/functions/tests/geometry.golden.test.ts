/**
 * Golden test 1 (Phase 3 §C): the shared geometry module must agree with pdf.js, the renderer the
 * app uses, within ±1 pt for every fixture page. Page boxes come from inspectPdf (the extraction
 * process-upload stores), so this also checks the stored geometry convention.
 */
import { assert, assertAlmostEquals } from 'jsr:@std/assert@1';
import { getDocument } from 'npm:pdfjs-dist@6.3.289/legacy/build/pdf.mjs';

import { fractionToPdfPoint, pdfPointToFraction } from '../../../shared/geometry.ts';
import { inspectPdf } from '../_shared/pdf/inspect.ts';
import { fixture } from '../_shared/test/fixtures.ts';

export const GEOMETRY_FIXTURES = [
  'pdf/portrait-3p.pdf',
  'pdf/landscape-a4.pdf',
  'pdf/rotated-90.pdf',
  'pdf/rotated-180.pdf',
  'pdf/mixed-sizes.pdf',
  'pdf/offset-cropbox.pdf',
  'pdf/nonzero-origin.pdf',
  'pdf/rotated-270-offset.pdf',
  'pdf/a6.pdf',
  'pdf/a0.pdf',
];

const GRID = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const TOLERANCE_PT = 1;

for (const file of GEOMETRY_FIXTURES) {
  Deno.test(`geometry matches pdf.js: ${file}`, async () => {
    const bytes = fixture(file);
    const info = await inspectPdf(bytes);
    const doc = await getDocument({ data: bytes.slice() }).promise;
    assert(doc.numPages === info.pageCount);
    let worst = 0;
    for (const page of info.pages) {
      const pdfPage = await doc.getPage(page.page_number);
      const viewport = pdfPage.getViewport({ scale: 1 });
      assertAlmostEquals(viewport.width, page.width_pt, 0.01, 'displayed width');
      assertAlmostEquals(viewport.height, page.height_pt, 0.01, 'displayed height');
      for (const fx of GRID) {
        for (const fy of GRID) {
          const [rx, ry] = viewport.convertToPdfPoint(fx * viewport.width, fy * viewport.height);
          const ours = fractionToPdfPoint(page, { x: fx, y: fy });
          worst = Math.max(worst, Math.abs(ours.x - rx), Math.abs(ours.y - ry));
          assertAlmostEquals(ours.x, rx, TOLERANCE_PT, `x at (${fx}, ${fy}) page ${page.page_number}`);
          assertAlmostEquals(ours.y, ry, TOLERANCE_PT, `y at (${fx}, ${fy}) page ${page.page_number}`);
          // And back: pdf.js viewport point → our fractions.
          const [vx, vy] = viewport.convertToViewportPoint(rx, ry);
          const back = pdfPointToFraction(page, { x: rx, y: ry });
          assertAlmostEquals(back.x * viewport.width, vx, TOLERANCE_PT);
          assertAlmostEquals(back.y * viewport.height, vy, TOLERANCE_PT);
        }
      }
    }
    console.log(`${file}: ${info.pageCount} page(s), worst deviation ${worst.toExponential(2)} pt`);
  });
}
