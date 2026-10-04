/**
 * Phase 6 "done when", through the real web app: the owner (a recipient on their own document) signs
 * in the app, a guest signs from the emailed link, and a CC only receives the result. Everyone gets
 * the flattened PDF and the certificate; the hashes on the certificate match the files.
 * Needs the web build on APP_URL (default http://localhost:8081), `npm run functions:serve` with
 * supabase/functions/.env from .env.example, and poppler's `pdftotext` for the certificate check.
 *
 *   node tests/e2e/signing-flow.mjs [screenshotDir]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const MAILPIT = 'http://127.0.0.1:54324';
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString(),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stamp = Date.now();
const ownerEmail = `owner-e2e.${stamp}@signflow.test`;
const guestEmail = `guest-e2e.${stamp}@signflow.test`;
const ccEmail = `cc-e2e.${stamp}@signflow.test`;
const password = 'Sign-e2e-pass1';

// --- A sent document: owner (order 1), guest (order 2), CC ---------------------------------------------
const { error: createError } = await admin.auth.admin.createUser({
  email: ownerEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Olivia Owner' },
});
if (createError) throw createError;
const { data: auth } = await client.auth.signInWithPassword({ email: ownerEmail, password });
const { data: doc } = await client
  .from('documents')
  .insert({ owner_id: auth.user.id, title: 'Consulting agreement' })
  .select('id')
  .single();
await client.storage
  .from('documents')
  .upload(
    `${auth.user.id}/${doc.id}/original.pdf`,
    readFileSync(new URL('../../fixtures/pdf/portrait-3p.pdf', import.meta.url)),
    { contentType: 'application/pdf' },
  );
const processed = await client.functions.invoke('process-upload', { body: { document_id: doc.id } });
if (processed.error) throw processed.error;
const recipient = async (name, email, role, order) => {
  const { data, error } = await client
    .from('document_recipients')
    .insert({ document_id: doc.id, name, email, role, signing_order: order })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};
const ownerRecipient = await recipient('Olivia Owner', ownerEmail, 'signer', 1);
const guestRecipient = await recipient('Gus Guest', guestEmail, 'signer', 2);
await recipient('Cora Copy', ccEmail, 'cc', 2);
const field = (recipientId, type, y, extra = {}) => ({
  id: crypto.randomUUID(),
  recipient_id: recipientId,
  page_number: 1,
  type,
  x: 0.12,
  y,
  width: type === 'checkbox' ? 0.04 : 0.36,
  height: type === 'checkbox' ? 0.03 : 0.06,
  required: true,
  properties: {},
  ...extra,
});
const fields = [
  field(ownerRecipient, 'signature', 0.62),
  field(ownerRecipient, 'date_signed', 0.7, { properties: { format: 'MMM d, yyyy' } }),
  field(guestRecipient, 'signature', 0.78),
  field(guestRecipient, 'text', 0.86, {
    properties: { fontSize: 12, align: 'left', validation: 'none', placeholder: 'Company' },
  }),
  field(guestRecipient, 'checkbox', 0.93, { required: false }),
];
const saved = await client.rpc('save_document_fields', { p_document_id: doc.id, p_fields: fields });
if (saved.error) throw saved.error;
const sent = await client.functions.invoke('send-document', { body: { document_id: doc.id } });
if (sent.error) throw new Error(`send failed: ${await sent.error.context?.text?.()}`);
console.log('sent', doc.id);

const browser = await chromium.launch();
const errors = [];
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}
const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();

/** Taps the centre of a field on the PDF surface. */
async function tapField(page, f, surfaceId) {
  const frame = page.locator(`[data-testid="${surfaceId}"] iframe`).contentFrame();
  const target = frame.locator(`.page[data-page="${f.page_number}"]`);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await target.boundingBox();
  await target.click({
    position: {
      x: Math.round(box.width * (f.x + f.width / 2)),
      y: Math.round(box.height * (f.y + f.height / 2)),
    },
  });
  await page.waitForTimeout(400); // the surface waits out a double tap
}

/** Signature sheet → Type → confirm. */
async function typeSignature(page) {
  await tid(page, 'signature-sheet').waitFor({ timeout: 10000 });
  await page.getByRole('radio', { name: 'Type' }).click();
  await tid(page, 'sig-confirm').click();
  await tid(page, 'signature-sheet').waitFor({ state: 'detached', timeout: 20000 });
}

// --- 1. The owner signs in the app ----------------------------------------------------------------------
const ownerPage = await newPage();
await ownerPage.goto(APP);
await tid(ownerPage, 'onboarding-skip').click();
await tid(ownerPage, 'welcome-sign-in').click();
await tid(ownerPage, 'sign-in-email').fill(ownerEmail);
await tid(ownerPage, 'sign-in-password').fill(password);
await tid(ownerPage, 'sign-in-submit').click();
await tid(ownerPage, 'home-screen').waitFor({ timeout: 20000 });
await ownerPage.goto(`${APP}/documents/${doc.id}`);
await tid(ownerPage, 'details-sign').click();
await tid(ownerPage, 'consent-sheet').waitFor({ timeout: 20000 });
if (out) await ownerPage.screenshot({ path: `${out}/web-consent.png` });
await tid(ownerPage, 'consent-agree').click();
await tid(ownerPage, 'consent-sheet').waitFor({ state: 'detached', timeout: 10000 });
await ownerPage
  .locator('[data-testid="signing-surface"] iframe')
  .contentFrame()
  .locator('.page[data-page="1"]')
  .waitFor({ timeout: 20000 });
await tapField(ownerPage, fields[0], 'signing-surface');
await typeSignature(ownerPage);
const ownerProgress = await tid(ownerPage, 'signing-progress').innerText();
if (ownerProgress !== '1 of 1 required') fail(`owner progress: ${ownerProgress}`);
if (out) await ownerPage.screenshot({ path: `${out}/web-owner-signed-field.png` });
await tid(ownerPage, 'signing-finish').click();
await tid(ownerPage, 'finish-confirm').click();
await tid(ownerPage, 'signing-finished').waitFor({ timeout: 30000 });
const ownerDone = await tid(ownerPage, 'signing-finished').innerText();
if (!ownerDone.includes("We'll email you a copy when everyone has signed"))
  fail(`owner finished: ${ownerDone}`);

// --- 2. The guest signs from the emailed link ----------------------------------------------------------
async function inbox(email) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return (await res.json()).messages ?? [];
}
async function message(id) {
  return (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
}
let guestLink = null;
for (const m of await inbox(guestEmail)) {
  const match = (await message(m.ID)).Text.match(/https?:\/\/\S+\/s\/([A-Za-z0-9_-]{43})/);
  if (match) {
    guestLink = `${APP}/s/${match[1]}`;
    break;
  }
}
if (!guestLink) throw new Error('guest was not emailed a link after the owner signed');
if ((await inbox(ccEmail)).length > 0) fail('CC emailed before completion');

const guestPage = await newPage();
await guestPage.goto(guestLink);
await tid(guestPage, 'consent-sheet').waitFor({ timeout: 30000 });
await tid(guestPage, 'consent-agree').click();
await tid(guestPage, 'consent-sheet').waitFor({ state: 'detached', timeout: 10000 });
const frame = guestPage.locator('[data-testid="signing-surface"] iframe').contentFrame();
await frame.locator('.page[data-page="1"]').waitFor({ timeout: 20000 });
// The owner's signature and date are shown as values.
await frame
  .locator(`[data-overlay-id="filled-${fields[0].id}"]`)
  .waitFor({ state: 'attached', timeout: 10000 });
if (out) await guestPage.screenshot({ path: `${out}/web-guest-start.png` });
await tid(guestPage, 'signing-next').click(); // → signature
await typeSignature(guestPage);
await tid(guestPage, 'signing-next').click(); // → text
await tid(guestPage, 'field-sheet-input').fill('Acme Robotics Ltd');
await tid(guestPage, 'field-sheet-confirm').click();
await tapField(guestPage, fields[4], 'signing-surface'); // optional checkbox, toggled in place
if (out) await guestPage.screenshot({ path: `${out}/web-guest-filled.png` });
await tid(guestPage, 'signing-finish').click();
await tid(guestPage, 'finish-confirm').click();
await tid(guestPage, 'signing-finished').waitFor({ timeout: 60000 });
const guestDone = await tid(guestPage, 'signing-finished').innerText();
if (!guestDone.includes('Everyone has signed')) fail(`guest finished: ${guestDone}`);
await tid(guestPage, 'signing-download-signed').waitFor();
if (out) await guestPage.screenshot({ path: `${out}/web-guest-finished.png` });

// --- 3. Completed: files, hashes, emails ----------------------------------------------------------------
const { data: final } = await admin
  .from('documents')
  .select('status, completed_path, certificate_path, completed_sha256, original_sha256')
  .eq('id', doc.id)
  .single();
if (final.status !== 'completed') fail(`status ${final.status}`);
const download = async (path) =>
  Buffer.from(await (await admin.storage.from('documents').download(path)).data.arrayBuffer());
const completed = await download(final.completed_path);
const certificate = await download(final.certificate_path);
if (sha256(completed) !== final.completed_sha256) fail('stored completed PDF does not match its hash');
const dir = join(tmpdir(), `signflow-e2e-${stamp}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'certificate.pdf'), certificate);
writeFileSync(join(dir, 'completed.pdf'), completed);
const certText = execFileSync('pdftotext', ['-layout', join(dir, 'certificate.pdf'), '-']).toString();
const completedText = execFileSync('pdftotext', [join(dir, 'completed.pdf'), '-']).toString();
if (!certText.includes(final.completed_sha256)) fail('certificate lacks the completed hash');
if (!certText.includes(final.original_sha256)) fail('certificate lacks the original hash');
const originalHash = sha256(readFileSync(new URL('../../fixtures/pdf/portrait-3p.pdf', import.meta.url)));
if (originalHash !== final.original_sha256) fail('original hash differs from the uploaded file');
if (!completedText.includes('Acme Robotics Ltd')) fail('text value not flattened');
for (const who of ['Olivia Owner', 'Gus Guest', 'Cora Copy', 'SignFlow account', 'Email link']) {
  if (!certText.includes(who)) fail(`certificate lacks ${who}`);
}

for (const email of [ownerEmail, guestEmail, ccEmail]) {
  const item = (await inbox(email)).find((m) => m.Subject.startsWith('Completed:'));
  if (!item) {
    fail(`no completion email to ${email}`);
    continue;
  }
  const full = await message(item.ID);
  const files = full.Attachments ?? [];
  if (files.length !== 2) fail(`${email}: ${files.length} attachments`);
  for (const a of files) {
    const bytes = Buffer.from(
      await (await fetch(`${MAILPIT}/api/v1/message/${item.ID}/part/${a.PartID}`)).arrayBuffer(),
    );
    const expected = a.FileName.includes('certificate') ? sha256(certificate) : final.completed_sha256;
    if (sha256(bytes) !== expected) fail(`${email}: attachment ${a.FileName} differs from the stored file`);
  }
}
if (out) {
  execFileSync('pdftoppm', [
    '-r',
    '70',
    '-png',
    '-f',
    '1',
    '-l',
    '1',
    join(dir, 'completed.pdf'),
    `${out}/completed`,
  ]);
  execFileSync('pdftoppm', [
    '-r',
    '70',
    '-png',
    '-f',
    '1',
    '-l',
    '1',
    join(dir, 'certificate.pdf'),
    `${out}/certificate`,
  ]);
}
if (errors.length) fail(`page errors: ${errors.join('; ')}`);
await browser.close();
console.log(
  process.exitCode
    ? 'FAILED'
    : `✓ owner (app) + guest (link) signed, CC copied; 3 completion emails with both PDFs; certificate hashes match the files (${final.completed_sha256.slice(0, 12)}…)`,
);
