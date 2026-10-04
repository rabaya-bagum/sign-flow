/**
 * PDF surface behaviour in Chromium, through the sandboxed-iframe harness (opaque origin, like a
 * file:// page in a native WebView): worker start-up and fallback, errors, input validation, taps.
 *
 *   npm run test:surface
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import { loadPdf, openSurface, startServer } from './harness.mjs';

let browser;
let server;
let origin;

before(async () => {
  ({ server, origin } = await startServer());
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function withSurface(fn, { breakWorkers = false } = {}) {
  const surface = await openSurface(browser, origin, { width: 600, height: 800, scale: 1, breakWorkers });
  try {
    await fn(surface);
  } finally {
    await surface.context.close();
  }
}

test('renders with pdf.js in a worker, even with an opaque origin', () =>
  withSurface(async ({ page, frame, errors }) => {
    const loaded = await loadPdf(page, `${origin}/fixtures/pdf/portrait-3p.pdf`);
    assert.equal(loaded.type, 'loaded');
    assert.equal(loaded.pageCount, 3);
    await frame.waitForSelector('canvas[data-page="1"]');
    assert.equal(await frame.evaluate(() => window.__surface.workerMode), 'worker');
    assert.equal(await frame.evaluate(() => origin), 'null');
    assert.deepEqual(errors, []);
  }));

test('falls back to the main thread when workers cannot start', () =>
  withSurface(
    async ({ page, frame }) => {
      const loaded = await loadPdf(page, `${origin}/fixtures/pdf/rotated-270-offset.pdf`);
      assert.equal(loaded.type, 'loaded');
      assert.deepEqual(loaded.pages[0], {
        page: 1,
        width_pt: 700,
        height_pt: 500,
        box_x_pt: 50,
        box_y_pt: 40,
        rotation: 270,
      });
      await frame.waitForSelector('canvas[data-page="1"]');
      assert.equal(await frame.evaluate(() => window.__surface.workerMode), 'main-thread');
    },
    { breakWorkers: true },
  ));

test('reports PDF_RENDER_FAILED for corrupt files and missing URLs, and recovers on reload', () =>
  withSurface(async ({ page }) => {
    const corrupt = await loadPdf(page, `${origin}/fixtures/pdf/corrupt.pdf`);
    assert.equal(corrupt.type, 'error');
    assert.equal(corrupt.code, 'PDF_RENDER_FAILED');
    const missing = await loadPdf(page, `${origin}/fixtures/pdf/does-not-exist.pdf`);
    assert.equal(missing.type, 'error');
    const retry = await loadPdf(page, `${origin}/fixtures/pdf/a6.pdf`);
    assert.equal(retry.type, 'loaded');
  }));

test('ignores invalid commands', () =>
  withSurface(async ({ page }) => {
    const before = await page.evaluate(() => window.events.length);
    await page.evaluate(() => {
      const frame = document.getElementById('surface').contentWindow;
      frame.postMessage(
        JSON.stringify({
          v: 1,
          type: 'load',
          url: 'file:///etc/hosts',
          background: '#FFFFFF',
          pageLabel: 'p',
        }),
        '*',
      );
      frame.postMessage(JSON.stringify({ v: 2, type: 'goToPage', page: 1 }), '*');
      frame.postMessage({ v: 1, type: 'setZoom', zoom: 2 }, '*'); // not a string
      frame.postMessage('{"v":1,"type":"eval"}', '*');
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.events.length), before);
  }));

test('a tap reports the page and displayed fractions', () =>
  withSurface(async ({ page, frame }) => {
    await loadPdf(page, `${origin}/fixtures/pdf/rotated-90.pdf`);
    const target = frame.locator('.page[data-page="1"]');
    const box = await target.boundingBox();
    const before = await page.evaluate(() => window.events.length);
    await target.click({ position: { x: box.width * 0.25, y: box.height * 0.75 } });
    const tap = await page.evaluate((after) => window.waitFor('tap', after), before);
    assert.equal(tap.page, 1);
    assert.ok(Math.abs(tap.x - 0.25) < 0.005, `x ${tap.x}`);
    assert.ok(Math.abs(tap.y - 0.75) < 0.005, `y ${tap.y}`);
  }));
