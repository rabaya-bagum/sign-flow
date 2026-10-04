/**
 * Coordinate spike, web round trip (Phase 3 §C), driven through the real app in Chromium.
 *
 * Prerequisites: local stack (`npm run db:start`), `supabase/functions/.env` with DEV_TOOLS=true and
 * `npm run functions:serve`, and a development web build of the app on http://localhost:8081
 * (`npx expo start --web`, or `npx expo export --platform web --dev` served with an SPA fallback).
 *
 *   node tests/surface/web-roundtrip.mjs [outDir]
 *
 * For each fixture it taps boxes on every page (at 1× and 2× zoom), stamps them with dev-stamp, and
 * measures where each stamp landed in the stamped PDF as rendered by the surface: the centre of the
 * stamped region must match the tapped point within 1 pt (or one rendered pixel, if coarser), and image
 * stamps must be upright.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const out = process.argv[2] ?? '.golden/roundtrip';
mkdirSync(out, { recursive: true });
const FIXTURES = [
  'portrait-3p',
  'rotated-90',
  'rotated-180',
  'rotated-270-offset',
  'mixed-sizes',
  'offset-cropbox',
  'nonzero-origin',
  'a0',
];
const TOLERANCE_PT = 1;
const SCREENSHOTS = new Set(['portrait-3p', 'rotated-90', 'rotated-270-offset', 'offset-cropbox']);

/** Bounding box of pixels near a colour on a page canvas, in canvas fractions. Runs in the surface. */
function colorBox(_element, { color: [tr, tg, tb], pageNumber, tolerance }) {
  const canvas = window.__surface.canvas(pageNumber);
  if (!canvas || canvas.width === 0) return null;
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
      if (
        Math.abs(data[i] - tr) < tolerance &&
        Math.abs(data[i + 1] - tg) < tolerance &&
        Math.abs(data[i + 2] - tb) < tolerance
      ) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return count
    ? {
        x0: minX / width,
        y0: minY / height,
        x1: (maxX + 1) / width,
        y1: (maxY + 1) / height,
        count,
        canvasWidth: width,
      }
    : null;
}

const browser = await chromium.launch();
const results = [];
let failures = 0;
for (const viewport of [{ width: 1280, height: 900, name: 'wide' }]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(APP);
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('welcome-sign-in').click();
  await page.getByTestId('sign-in-email').fill('owner@signflow.test');
  await page.getByTestId('sign-in-password').fill('SignFlow-dev-123');
  await page.getByTestId('sign-in-submit').click();
  await page.waitForSelector('text=Recent documents', { timeout: 20000 });
  await page.goto(`${APP}/dev/coordinate-spike`);
  await page.getByTestId('spike-open').waitFor({ timeout: 20000 });

  const left = page.locator('[data-testid="spike-original"] iframe').contentFrame();
  const right = page.locator('[data-testid="spike-stamped"] iframe').contentFrame();

  for (const fixture of FIXTURES) {
    const previous = (await left.locator('.page').count())
      ? await left.locator('.page').first().elementHandle()
      : null;
    await page.getByTestId(`spike-fixture-${fixture}`).click();
    await previous?.waitForElementState('hidden', { timeout: 20000 }); // the old document is gone
    await left.locator('canvas[data-page="1"]').waitFor({ timeout: 20000 });
    const pageCount = await left.locator('.page').count();
    const taps = [];
    for (let n = 1; n <= pageCount; n++) {
      for (const [kind, fx, fy, zoom] of [
        ['rect', 0.3, 0.25, 1],
        ['image', 0.62, 0.7, 2],
      ]) {
        await page.getByRole('button', { name: `${zoom}×`, exact: true }).click();
        await page.getByRole('radio', { name: kind === 'rect' ? 'Rect' : 'Image' }).click();
        const target = left.locator(`.page[data-page="${n}"]`);
        await target.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        const box = await target.boundingBox();
        // Tap at the fraction, rounded to a whole CSS pixel like a finger would.
        await target.click({ position: { x: Math.round(box.width * fx), y: Math.round(box.height * fy) } });
        await page.waitForTimeout(450); // single taps are confirmed after the double-tap window
        taps.push({
          page: n,
          kind,
          zoom,
          fx: Math.round(box.width * fx) / box.width,
          fy: Math.round(box.height * fy) / box.height,
        });
      }
    }
    await page.getByRole('button', { name: '1×', exact: true }).click();
    const stale = (await right.locator('.page').count())
      ? await right.locator('.page').first().elementHandle()
      : null;
    await page.getByTestId('spike-stamp').click();
    await stale?.waitForElementState('hidden', { timeout: 20000 });
    await right.locator('canvas[data-page="1"]').waitFor({ timeout: 20000 });

    for (const tap of taps) {
      const target = right.locator(`.page[data-page="${tap.page}"]`);
      await target.scrollIntoViewIfNeeded();
      await right.locator(`canvas[data-page="${tap.page}"]`).waitFor({ timeout: 15000 });
      await page.waitForTimeout(300);
      let measured;
      if (tap.kind === 'rect') {
        // dev-stamp fills rgb(0.86, 0.1, 0.1) at 60% opacity over white ≈ (232, 117, 117).
        measured = await right
          .locator('body')
          .evaluate(colorBox, { color: [232, 117, 117], pageNumber: tap.page, tolerance: 24 });
      } else {
        const cyan = await right
          .locator('body')
          .evaluate(colorBox, { color: [0, 200, 200], pageNumber: tap.page, tolerance: 40 });
        const magenta = await right
          .locator('body')
          .evaluate(colorBox, { color: [255, 0, 255], pageNumber: tap.page, tolerance: 40 });
        measured = cyan && magenta ? { ...cyan, magenta } : null;
      }
      results.push({ fixture, ...tap, measured });
    }
    if (SCREENSHOTS.has(fixture)) await page.screenshot({ path: `${out}/${viewport.name}-${fixture}.png` });
  }
  if (errors.length) {
    failures++;
    console.error('page errors:', errors);
  }
  await context.close();
}
await browser.close();

// Expected stamp centre = tap point (boxes are centred on the tap unless clamped at the page edge).
const sizes = {
  'portrait-3p': [
    [612, 792],
    [612, 792],
    [612, 792],
  ],
  'rotated-90': [[792, 612]],
  'rotated-180': [[612, 792]],
  'rotated-270-offset': [[700, 500]],
  'mixed-sizes': [
    [612, 792],
    [841.89, 595.28],
    [297.64, 419.53],
    [792, 612],
  ],
  'offset-cropbox': [[540, 720]],
  'nonzero-origin': [[512, 692]],
  a0: [[2383.94, 3370.39]],
};
let worst = 0;
for (const r of results) {
  const [w, h] = sizes[r.fixture][r.page - 1];
  if (!r.measured) {
    failures++;
    console.error(`✗ ${r.fixture} p${r.page} ${r.kind}: stamp not found`);
    continue;
  }
  const cx = ((r.measured.x0 + r.measured.x1) / 2) * w;
  const cy = ((r.measured.y0 + r.measured.y1) / 2) * h;
  const dx = Math.abs(cx - r.fx * w);
  const dy = Math.abs(cy - r.fy * h);
  worst = Math.max(worst, dx, dy);
  let upright = true;
  if (r.kind === 'image') {
    // The magenta quadrant must sit at the top-left of the image.
    const m = r.measured.magenta;
    upright =
      Math.abs(m.x0 - r.measured.x0) * w < 2 &&
      Math.abs(m.y0 - r.measured.y0) * h < 2 &&
      m.x1 < (r.measured.x0 + r.measured.x1) / 2 + 0.002;
  }
  // ±1 pt, or one rendered pixel when a pixel is coarser than that (A0 on a phone-sized pane): the
  // measurement cannot resolve finer than the raster.
  const tolerance = Math.max(TOLERANCE_PT, w / r.measured.canvasWidth);
  const ok = dx <= tolerance && dy <= tolerance && upright;
  if (!ok) failures++;
  console.log(
    `${ok ? '✓' : '✗'} ${r.fixture} p${r.page} ${r.kind} (tapped at ${r.zoom}×): Δx ${dx.toFixed(2)} pt, Δy ${dy.toFixed(2)} pt (tolerance ${tolerance.toFixed(2)})${r.kind === 'image' ? `, upright ${upright}` : ''}`,
  );
}
console.log(
  `\n${results.length} stamps, worst centre deviation ${worst.toFixed(3)} pt, ${failures} failure(s)`,
);
process.exit(failures ? 1 : 0);
