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

test('preview mode is static: no scrolling and no taps', () =>
  withSurface(async ({ page, frame }) => {
    const before = await page.evaluate(() => window.events.length);
    await page.evaluate(
      (u) =>
        window.send({
          type: 'load',
          url: u,
          background: '#FFFFFF',
          pageLabel: 'Page {page} of {total}',
          interactive: false,
        }),
      `${origin}/fixtures/pdf/portrait-3p.pdf`,
    );
    await page.evaluate((after) => window.waitFor('loaded', after), before);
    await frame.waitForSelector('canvas[data-page="1"]');
    assert.equal(
      await frame.evaluate(() => getComputedStyle(document.getElementById('viewer')).overflow),
      'hidden',
    );
    const count = await page.evaluate(() => window.events.length);
    await frame.locator('.page[data-page="1"]').click({ position: { x: 50, y: 50 }, force: true });
    await page.waitForTimeout(500);
    const taps = await page.evaluate(
      (after) => window.events.slice(after).filter((e) => e.type === 'tap').length,
      count,
    );
    assert.equal(taps, 0);
  }));

test('editable overlays: tap selects, drag moves, corner handles resize (clamped, min size)', () =>
  withSurface(async ({ page, frame }) => {
    await loadPdf(page, `${origin}/fixtures/pdf/portrait-3p.pdf`);
    const overlay = {
      id: 'f1',
      page: 1,
      kind: 'rect',
      rect: { x: 0.2, y: 0.2, width: 0.3, height: 0.1 },
      editable: true,
      text: 'Signature',
      minWidth: 0.1,
      minHeight: 0.03,
      color: '#2B59D9',
    };
    await page.evaluate((o) => window.send({ type: 'setOverlays', overlays: [o] }), overlay);
    const el = frame.locator('[data-overlay-id="f1"]');
    await el.waitFor();
    const pageBox = await frame.locator('.page[data-page="1"]').boundingBox();

    let before = await page.evaluate(() => window.events.length);
    await el.click();
    const tap = await page.evaluate((after) => window.waitFor('overlayTap', after), before);
    assert.equal(tap.id, 'f1');
    const plainTaps = await page.evaluate(
      (after) => window.events.slice(after).filter((e) => e.type === 'tap').length,
      before,
    );
    assert.equal(plainTaps, 0, 'tapping a field does not also tap the page');

    // Drag by +10% / +5% of the page.
    const box = await el.boundingBox();
    before = await page.evaluate(() => window.events.length);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + pageBox.width * 0.1,
      box.y + box.height / 2 + pageBox.height * 0.05,
      { steps: 8 },
    );
    await page.mouse.up();
    const moved = await page.evaluate((after) => window.waitFor('overlayChanged', after), before);
    assert.ok(
      Math.abs(moved.rect.x - 0.3) < 0.005 && Math.abs(moved.rect.y - 0.25) < 0.005,
      JSON.stringify(moved.rect),
    );
    assert.equal(moved.rect.width, 0.3);

    // Select it (handles appear), then drag the SE handle far up-left: stops at the minimum size.
    await page.evaluate(
      (o) => {
        window.send({ type: 'setOverlays', overlays: [o] });
        window.send({ type: 'highlight', id: 'f1' });
      },
      { ...overlay, rect: moved.rect },
    );
    const handle = frame.locator('[data-overlay-id="f1"] .handle.se');
    await handle.waitFor();
    const h = await handle.boundingBox();
    before = await page.evaluate(() => window.events.length);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x - 500, h.y - 500, { steps: 8 });
    await page.mouse.up();
    const resized = await page.evaluate((after) => window.waitFor('overlayChanged', after), before);
    assert.ok(
      Math.abs(resized.rect.width - 0.1) < 1e-6 && Math.abs(resized.rect.height - 0.03) < 1e-6,
      JSON.stringify(resized.rect),
    );
    assert.ok(Math.abs(resized.rect.x - moved.rect.x) < 1e-9, 'the opposite corner stays put');

    // Dragging past the page edge snaps to the edge.
    const b2 = await el.boundingBox();
    before = await page.evaluate(() => window.events.length);
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); // the middle, not a corner handle
    await page.mouse.down();
    await page.mouse.move(b2.x + 2000, b2.y + b2.height / 2, { steps: 8 });
    await page.mouse.up();
    const edge = await page.evaluate((after) => window.waitFor('overlayChanged', after), before);
    assert.ok(Math.abs(edge.rect.x + edge.rect.width - 1) < 1e-9, JSON.stringify(edge.rect));
  }));
