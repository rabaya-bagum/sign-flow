/**
 * Phase 4 "done when": fields placed on portrait, landscape and rotated pages persist and reload in
 * exactly the same positions. Drives the real web app (production export on APP_URL, default
 * http://localhost:8081) against the local stack with `npm run functions:serve` running.
 *
 *   node tests/e2e/editor-roundtrip.mjs [screenshotDir]
 *
 * Creates a draft from fixtures/pdf/mixed-sizes.pdf (Letter, A4 landscape, A6, Letter /Rotate 270),
 * places one field per page by tapping, drags one, reloads the editor and compares every rect with
 * what was placed and with the database.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString(),
);
const supabase = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};

// --- Draft with a 4-page mixed-size PDF -------------------------------------------------------------
// A throwaway user, so seed data (checked by pgTAP) is never touched. `npm run db:reset` clears it.
const email = `editor-e2e.${Date.now()}@signflow.test`;
const password = 'Editor-e2e-pass1';
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Editor E2E' },
});
if (createError) throw createError;
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) throw authError;
const userId = auth.user.id;
const { data: doc, error: docError } = await supabase
  .from('documents')
  .insert({ owner_id: userId, title: `Editor round trip ${Date.now()}` })
  .select('id')
  .single();
if (docError) throw docError;
const bytes = readFileSync(new URL('../../fixtures/pdf/mixed-sizes.pdf', import.meta.url));
const { error: uploadError } = await supabase.storage
  .from('documents')
  .upload(`${userId}/${doc.id}/original.pdf`, bytes, { contentType: 'application/pdf' });
if (uploadError) throw uploadError;
const { error: processError } = await supabase.functions.invoke('process-upload', {
  body: { document_id: doc.id },
});
if (processError) throw processError;
console.log('draft', doc.id);

// --- Place fields in the browser ---------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', async (r) => {
  if (r.url().includes('save_document_fields') && r.status() >= 400)
    console.log('save failed', r.status(), await r.text());
});
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
await page.goto(APP);
await tid('onboarding-skip').click();
await tid('welcome-sign-in').click();
await tid('sign-in-email').fill(email);
await tid('sign-in-password').fill(password);
await tid('sign-in-submit').click();
await tid('home-screen').waitFor({ timeout: 20000 });

async function openEditor() {
  await page.goto(`${APP}/documents/${doc.id}/fields`);
  const frame = page.locator('[data-testid="editor-surface"] iframe').contentFrame();
  await frame.locator('.page[data-page="4"]').waitFor({ state: 'attached', timeout: 20000 });
  return frame;
}
async function overlayRects(frame) {
  return frame.locator('[data-overlay-id]').evaluateAll((els) =>
    els
      .map((el) => ({
        id: el.dataset.overlayId,
        page: Number(el.closest('.page').dataset.page),
        left: el.style.left,
        top: el.style.top,
        width: el.style.width,
        height: el.style.height,
      }))
      .sort((a, b) => a.page - b.page),
  );
}

let frame = await openEditor();
await tid('recipient-chip-0').waitFor({ timeout: 20000 }); // placeholder "Signer 1"
const tools = ['signature', 'text', 'date_signed', 'initials'];
const taps = [];
for (let n = 1; n <= 4; n++) {
  const target = frame.locator(`.page[data-page="${n}"]`);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await tid(`tool-${tools[n - 1]}`).click();
  const box = await target.boundingBox();
  const fx = 0.4;
  const fy = 0.35;
  await target.click({ position: { x: Math.round(box.width * fx), y: Math.round(box.height * fy) } });
  await page.waitForTimeout(450);
  taps.push({
    page: n,
    fx: Math.round(box.width * fx) / box.width,
    fy: Math.round(box.height * fy) / box.height,
  });
  await tid('field-deselect').click();
}
// Drag the field on the rotated page 4 by +10% horizontally.
const rotated = frame.locator('.page[data-page="4"] [data-overlay-id]');
const rb = await rotated.boundingBox();
const p4 = await frame.locator('.page[data-page="4"]').boundingBox();
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.mouse.down();
await page.mouse.move(rb.x + rb.width / 2 + p4.width * 0.1, rb.y + rb.height / 2, { steps: 10 });
await page.mouse.up();
await page
  .waitForFunction(
    () => document.querySelector('[data-testid="editor-save-status"]')?.textContent === 'Saved',
    null,
    { timeout: 10000 },
  )
  .catch(async () => {
    fail(`save status: ${await tid('editor-save-status').innerText()}`);
  });
if (out) await page.screenshot({ path: `${out}/web-editor.png` });
const before = await overlayRects(frame);

// Centres match the taps (pages 1–3; page 4 was dragged).
for (const tap of taps.slice(0, 3)) {
  const o = before.find((r) => r.page === tap.page);
  const cx = (parseFloat(o.left) + parseFloat(o.width) / 2) / 100;
  const cy = (parseFloat(o.top) + parseFloat(o.height) / 2) / 100;
  // CSS keeps percentages to ~6 significant digits, so compare the DOM within 1e-4 of the page.
  if (Math.abs(cx - tap.fx) > 1e-4 || Math.abs(cy - tap.fy) > 1e-4)
    fail(`page ${tap.page}: centre ${cx},${cy} ≠ tap ${tap.fx},${tap.fy}`);
}

// --- Reload and compare ------------------------------------------------------------------------------
const { data: savedRows } = await supabase
  .from('document_fields')
  .select('id, page_number, type, x, y, width, height')
  .eq('document_id', doc.id)
  .order('page_number');
frame = await openEditor();
await page.waitForTimeout(3000);
if (out) await page.screenshot({ path: `${out}/web-editor-reloaded.png` });
const after = await overlayRects(frame);
console.log('overlays after reload:', after.length);
const { data: rows } = await supabase
  .from('document_fields')
  .select('id, page_number, type, x, y, width, height')
  .eq('document_id', doc.id)
  .order('page_number');
console.log('fields in database:', rows.map((r) => `${r.type}@p${r.page_number}`).join(', '));
if (JSON.stringify(after) !== JSON.stringify(before))
  fail(`reloaded overlays differ:\n${JSON.stringify(before)}\n${JSON.stringify(after)}`);
for (const r of rows) {
  const o = after.find((x) => x.id === r.id);
  const expect = {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.width * 100}%`,
    height: `${r.height * 100}%`,
  };
  for (const k of Object.keys(expect)) {
    if (!o || Math.abs(parseFloat(o[k]) - parseFloat(expect[k])) > 1e-2)
      fail(`field ${r.id} ${k}: overlay ${o?.[k]} ≠ db ${expect[k]}`);
  }
}
if (JSON.stringify(rows) !== JSON.stringify(savedRows)) fail('database rows changed across the reload');
if (rows.length !== 4) fail(`expected 4 fields, found ${rows.length}`);
const p4row = rows.find((r) => r.page_number === 4);
if (!(p4row.x > 0.45)) fail(`dragged field on the rotated page did not move (x=${p4row.x})`);
if (errors.length) fail(`page errors: ${errors.join('; ')}`);
await browser.close();
console.log(
  process.exitCode
    ? 'FAILED'
    : `✓ 4 fields (portrait, landscape, A6, /Rotate 270) reloaded in exactly the same positions; dragged field saved`,
);
