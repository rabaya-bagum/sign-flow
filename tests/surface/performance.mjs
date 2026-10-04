/**
 * Surface performance on the 200-page / ~22 MB fixture in Chromium (Phase 3 spike report).
 * Profiles: iPhone-sized (390×844 @3x) and a throttled low-end Android-sized device (360×780 @2x,
 * 4× CPU slowdown). Prints time to first page, canvas memory while scrolling every page, JS heap,
 * and zoom re-render time. Run: node tests/surface/performance.mjs (after scripts/golden/generate-perf.ts).
 */
import { chromium } from 'playwright';

import { loadPdf, openSurface, startServer } from './harness.mjs';

const PROFILES = [
  { name: 'iPhone-sized 390×844 @3x', width: 390, height: 844, scale: 3, cpu: 1 },
  { name: 'Low-end Android 360×780 @2x, CPU ÷4', width: 360, height: 780, scale: 2, cpu: 4 },
];

const { server, origin } = await startServer();
const browser = await chromium.launch();
const MB = 1024 * 1024;
const rows = [];

for (const profile of PROFILES) {
  const { context, page, frame, errors } = await openSurface(browser, origin, profile);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await cdp.send('Performance.enable');
  const heap = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize').value / MB;
  };

  const t0 = Date.now();
  const loaded = await loadPdf(page, `${origin}/.golden/heavy-200.pdf`);
  if (loaded.type !== 'loaded') throw new Error(JSON.stringify(loaded));
  const loadedMs = Date.now() - t0;
  await frame.waitForSelector('canvas[data-page="1"]', { timeout: 60000 });
  const stats = () => frame.evaluate(() => ({ ...window.__surface.stats }));
  const first = await stats();

  // Scroll through every page; track the virtualization's canvas count and pixel memory.
  let maxCanvases = 0;
  let maxPixels = 0;
  const scrollStart = Date.now();
  for (let n = 1; n <= loaded.pageCount; n++) {
    await page.evaluate((p) => window.send({ type: 'goToPage', page: p }), n);
    await frame.waitForSelector(`canvas[data-page="${n}"]`, { timeout: 30000 });
    const s = await stats();
    maxCanvases = Math.max(maxCanvases, s.liveCanvases);
    maxPixels = Math.max(maxPixels, s.canvasPixels);
  }
  const scrollMs = Date.now() - scrollStart;
  const end = await stats();
  const heapAfter = await heap();

  // Zoom: re-render time of the visible page at 2×.
  const rendersBefore = end.renders;
  await page.evaluate(() => window.send({ type: 'setZoom', zoom: 2 }));
  await frame.waitForFunction((r) => window.__surface.stats.renders > r, rendersBefore, { timeout: 30000 });
  const zoomed = await stats();

  rows.push({
    profile: profile.name,
    'load → loaded event (page sizes known)': `${loadedMs} ms`,
    'first page rendered': `${first.firstPageMs.toFixed(0)} ms`,
    'scroll all 200 pages': `${(scrollMs / 1000).toFixed(1)} s (${(scrollMs / loaded.pageCount).toFixed(0)} ms/page)`,
    'max live canvases': maxCanvases,
    'max canvas memory': `${((maxPixels * 4) / MB).toFixed(0)} MB`,
    'canvases after scroll': end.liveCanvases,
    'JS heap after scroll': `${heapAfter.toFixed(0)} MB`,
    'zoom 2× re-render': `${zoomed.lastRenderMs.toFixed(0)} ms`,
    errors: errors.filter((e) => !/favicon|404/.test(e)).length,
  });
  await context.close();
}

await browser.close();
server.close();
for (const row of rows) {
  console.log(`\n${row.profile}`);
  for (const [k, v] of Object.entries(row)) if (k !== 'profile') console.log(`  ${k}: ${v}`);
}
