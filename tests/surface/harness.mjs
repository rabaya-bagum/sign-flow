/**
 * Test harness for the PDF surface: a static server (repo root, CORS on, like Supabase Storage) and
 * a host page that embeds assets/pdf-surface/surface.html in an iframe and speaks the bridge
 * protocol — the same path the web app uses (sandboxed, so the surface has an opaque origin, like a
 * file:// page in a native WebView).
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(fileURLToPath(import.meta.url), '../../..'));
const TYPES = {
  '.html': 'text/html',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.png': 'image/png',
};

const HOST_PAGE = `<!doctype html><html><body style="margin:0">
<iframe id="surface" src="/assets/pdf-surface/surface.html" sandbox="allow-scripts" style="border:0;width:100vw;height:100vh;display:block"></iframe>
<script>
  window.events = [];
  window.addEventListener('message', (e) => { try { window.events.push(JSON.parse(e.data)); } catch {} });
  window.send = (cmd) => document.getElementById('surface').contentWindow.postMessage(JSON.stringify({ v: 1, ...cmd }), '*');
  window.waitFor = (type, after = 0) => new Promise((resolve) => {
    const tick = () => { const ev = window.events.slice(after).find((e) => e.type === type); ev ? resolve(ev) : setTimeout(tick, 20); };
    tick();
  });
</script></body></html>`;

export function startServer() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'range');
    res.setHeader('Access-Control-Expose-Headers', 'content-range, accept-ranges, content-length');
    if (req.method === 'OPTIONS') return res.end();
    if (path === '/host.html') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(HOST_PAGE);
    }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    let body;
    try {
      if (!statSync(file).isFile()) throw new Error('not a file');
      body = readFileSync(file);
    } catch {
      return res.writeHead(404).end();
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : body.length - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Content-Length': end - start + 1,
      });
      return res.end(body.subarray(start, end + 1));
    }
    res.setHeader('Content-Length', body.length);
    res.end(body);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    ),
  );
}

export async function openSurface(
  browser,
  origin,
  { width = 390, height = 844, scale = 3, breakWorkers = false } = {},
) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  if (breakWorkers) {
    // Simulates a WebView where workers cannot start (the surface must fall back to the main thread).
    await context.addInitScript(() => {
      window.Worker = class {
        constructor() {
          throw new Error('Workers disabled for this test');
        }
      };
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${origin}/host.html`);
  await page.evaluate(() => window.waitFor('ready'));
  const frame = page.frames().find((f) => f.url().includes('surface.html'));
  return { context, page, frame, errors };
}

/** Loads a PDF and resolves with the `loaded` event. */
export async function loadPdf(page, url) {
  const before = await page.evaluate(() => window.events.length);
  await page.evaluate(
    (u) => window.send({ type: 'load', url: u, background: '#F7F8FA', pageLabel: 'Page {page} of {total}' }),
    url,
  );
  return page.evaluate(async (after) => {
    const ev = await Promise.race([window.waitFor('loaded', after), window.waitFor('error', after)]);
    return ev;
  }, before);
}
