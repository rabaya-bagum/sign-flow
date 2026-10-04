/**
 * Golden test 2 (Phase 3 §C): rects/images stamped by stamp.ts (see scripts/golden/generate-stamped.ts)
 * must appear exactly where the geometry module says when rendered by the real PDF surface
 * (assets/pdf-surface/surface.html) in Chromium. Tolerance: ±1 pt on every edge.
 *
 *   npm run test:golden
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { join } from 'node:path';

import { chromium } from 'playwright';

import { loadPdf, openSurface, ROOT, startServer } from './harness.mjs';

const TOLERANCE_PT = 1;
const manifest = JSON.parse(readFileSync(join(ROOT, '.golden/manifest.json'), 'utf8'));
const byPdf = Object.groupBy(manifest, (e) => e.pdf);

let browser;
let server;
let origin;
const deviations = [];

before(async () => {
  ({ server, origin } = await startServer());
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  const worst = deviations.reduce((m, d) => Math.max(m, d), 0);
  console.log(`golden raster: ${deviations.length} edges checked, worst deviation ${worst.toFixed(3)} pt`);
});

/** Bounding box (canvas pixels) of pixels close to `color`; runs inside the surface frame. */
function colorBox({ color: [tr, tg, tb], pageNumber }) {
  const canvas = window.__surface.canvas(pageNumber);
  if (!canvas) return null;
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1,
    count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // ≥50% coverage of the target colour (anti-aliased edges count from half a pixel).
      if (Math.abs(data[i] - tr) < 64 && Math.abs(data[i + 1] - tg) < 64 && Math.abs(data[i + 2] - tb) < 64) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1, count, width, height };
}

for (const [pdf, expectations] of Object.entries(byPdf)) {
  test(`stamps render in place: ${pdf}`, async () => {
    const { context, page, frame, errors } = await openSurface(browser, origin, {
      width: 1100,
      height: 1000,
      scale: 3,
    });
    try {
      const loaded = await loadPdf(page, `${origin}/.golden/${pdf}`);
      assert.equal(loaded.type, 'loaded', JSON.stringify(loaded));
      for (const pageNumber of [...new Set(expectations.map((e) => e.page))]) {
        await page.evaluate((n) => window.send({ type: 'goToPage', page: n }), pageNumber);
        await frame.waitForSelector(`canvas[data-page="${pageNumber}"]`, { timeout: 15000 });
        for (const e of expectations.filter((x) => x.page === pageNumber)) {
          const box = await frame.evaluate(colorBox, { color: e.color, pageNumber });
          assert.ok(box && box.count > 0, `colour ${e.color} not found on page ${pageNumber}`);
          const edges = {
            left: [box.minX / box.width, e.rect.x, e.width_pt],
            right: [box.maxX / box.width, e.rect.x + e.rect.width, e.width_pt],
            top: [box.minY / box.height, e.rect.y, e.height_pt],
            bottom: [box.maxY / box.height, e.rect.y + e.rect.height, e.height_pt],
          };
          for (const [edge, [actual, expected, sizePt]] of Object.entries(edges)) {
            const deviationPt = Math.abs(actual - expected) * sizePt;
            deviations.push(deviationPt);
            assert.ok(
              deviationPt <= TOLERANCE_PT,
              `${pdf} p${pageNumber} rgb(${e.color}) ${edge}: off by ${deviationPt.toFixed(2)} pt`,
            );
          }
        }
      }
      assert.deepEqual(
        errors.filter((m) => !/favicon|404/.test(m)),
        [],
      );
    } finally {
      await context.close();
    }
  });
}
