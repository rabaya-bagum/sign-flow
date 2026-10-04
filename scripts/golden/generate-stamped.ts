/**
 * Golden test 2, step 1 (Phase 3 §C): stamps known fractional rects and an asymmetric image marker
 * onto every page of every geometry fixture with the production primitives (stamp.ts), and writes
 * the expected displayed positions. tests/surface/golden.test.mjs renders the results with the real
 * PDF surface and checks where the colours landed.
 *
 *   npx deno run --node-modules-dir=none -A scripts/golden/generate-stamped.ts
 */
import { fitAspect, type FractionalRect } from '../../shared/geometry.ts';
import { PDFDocument } from '../../supabase/functions/_shared/deps.ts';
import { inspectPdf } from '../../supabase/functions/_shared/pdf/inspect.ts';
import { stampImage, stampRect } from '../../supabase/functions/_shared/pdf/stamp.ts';
import { fixture, rgbPng } from '../../supabase/functions/_shared/test/fixtures.ts';
import { GEOMETRY_FIXTURES } from '../../supabase/functions/tests/geometry.golden.test.ts';

const OUT = new URL('../../.golden/', import.meta.url);
await Deno.mkdir(OUT, { recursive: true });

type RGB = [number, number, number];
interface Expectation {
  pdf: string;
  page: number;
  /** Pure colour searched for in the rendered canvas (0..255). */
  color: RGB;
  /** Expected displayed rect, fractions of the page. */
  rect: FractionalRect;
  /** Displayed page size in points (to express tolerance in points). */
  width_pt: number;
  height_pt: number;
}

const RECTS: { color: RGB; rect: FractionalRect }[] = [
  { color: [255, 0, 0], rect: { x: 0.1, y: 0.08, width: 0.2, height: 0.1 } },
  { color: [0, 200, 0], rect: { x: 0.62, y: 0.7, width: 0.3, height: 0.15 } },
  { color: [0, 0, 255], rect: { x: 0.45, y: 0.4, width: 0.1, height: 0.25 } },
];
const IMAGE_RECT: FractionalRect = { x: 0.2, y: 0.5, width: 0.6, height: 0.15 };
const MAGENTA: RGB = [255, 0, 255];
const CYAN: RGB = [0, 255, 255];
// 80×40 marker: magenta top-left quadrant, cyan elsewhere. A rotated or mirrored stamp moves the magenta.
const marker = await rgbPng(80, 40, (x, y) => (x < 40 && y < 20 ? MAGENTA : CYAN));

const expectations: Expectation[] = [];
for (const file of GEOMETRY_FIXTURES) {
  const bytes = fixture(file);
  const info = await inspectPdf(bytes);
  const name = file.replace(/^pdf\//, '').replace(/\.pdf$/, '');

  const rectsDoc = await PDFDocument.load(bytes);
  const imageDoc = await PDFDocument.load(bytes);
  for (const page of info.pages) {
    for (const { color, rect } of RECTS) {
      stampRect(rectsDoc, page.page_number - 1, rect, page, { color: color.map((c) => c / 255) as RGB });
      expectations.push({ pdf: `${name}.rects.pdf`, page: page.page_number, color, rect, width_pt: page.width_pt, height_pt: page.height_pt });
    }
    await stampImage(imageDoc, page.page_number - 1, IMAGE_RECT, page, marker);
    const fitted = fitAspect(page, IMAGE_RECT, 2);
    expectations.push({
      pdf: `${name}.image.pdf`,
      page: page.page_number,
      color: MAGENTA,
      rect: { x: fitted.x, y: fitted.y, width: fitted.width / 2, height: fitted.height / 2 },
      width_pt: page.width_pt,
      height_pt: page.height_pt,
    });
    expectations.push({ pdf: `${name}.image.pdf`, page: page.page_number, color: CYAN, rect: fitted, width_pt: page.width_pt, height_pt: page.height_pt });
  }
  await Deno.writeFile(new URL(`${name}.rects.pdf`, OUT), await rectsDoc.save());
  await Deno.writeFile(new URL(`${name}.image.pdf`, OUT), await imageDoc.save());
}
await Deno.writeTextFile(new URL('manifest.json', OUT), JSON.stringify(expectations, null, 2));
console.log(`wrote ${expectations.length} expectations for ${GEOMETRY_FIXTURES.length} fixtures to .golden/`);
