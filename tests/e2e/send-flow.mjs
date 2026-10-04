/**
 * Phase 5 "done when", through the real web app: recipients step (two sequential signers) → field
 * editor (a signature for each) → review & send. Only the first signer is emailed (read from Mailpit),
 * and the draft is locked afterwards. Needs the web build on APP_URL (default http://localhost:8081)
 * and `npm run functions:serve` with supabase/functions/.env from .env.example.
 *
 *   node tests/e2e/send-flow.mjs [screenshotDir]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

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
const stamp = Date.now();
const email = `send-e2e.${stamp}@signflow.test`;
const password = 'Send-e2e-pass1';
const first = `first.${stamp}@signflow.test`;
const second = `second.${stamp}@signflow.test`;

const { error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Sam Sender' },
});
if (createError) throw createError;
const { data: auth } = await client.auth.signInWithPassword({ email, password });
const { data: doc } = await client
  .from('documents')
  .insert({ owner_id: auth.user.id, title: 'Lease agreement' })
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

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })
).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
const shot = async (name) =>
  out && (await page.waitForTimeout(500), await page.screenshot({ path: `${out}/${name}.png` }));

await page.goto(APP);
await tid('onboarding-skip').click();
await tid('welcome-sign-in').click();
await tid('sign-in-email').fill(email);
await tid('sign-in-password').fill(password);
await tid('sign-in-submit').click();
await tid('home-screen').waitFor({ timeout: 20000 });

// Recipients step.
await page.goto(`${APP}/documents/${doc.id}`);
await tid('details-edit-recipients').click();
await tid('recipient-name-0').waitFor();
await tid('recipient-name-0').fill('First Signer');
await tid('recipient-email-0').fill(first);
await tid('recipients-add').click();
await tid('recipient-name-1').fill('Second Signer');
await tid('recipient-email-1').fill(second);
await tid('recipients-sequential').click();
await shot('web-recipients');
await tid('recipients-next').click();

// Field editor: a signature for each signer.
const frame = page.locator('[data-testid="editor-surface"] iframe').contentFrame();
await frame.locator('.page[data-page="1"] canvas').waitFor({ timeout: 20000 });
for (const [chip, y] of [
  [0, 0.3],
  [1, 0.6],
]) {
  await tid(`recipient-chip-${chip}`).click();
  await tid('tool-signature').click();
  const box = await frame.locator('.page[data-page="1"]').boundingBox();
  await frame.locator('.page[data-page="1"]').click({ position: { x: box.width * 0.5, y: box.height * y } });
  await page.waitForTimeout(450);
  await tid('field-deselect').click();
}
await shot('web-editor-two-signers');
await tid('editor-next').click();

// Review & send.
await tid('review-send').waitFor({ timeout: 20000 });
await tid('review-message').fill('Please sign by Friday.');
await shot('web-review');
if (await tid('review-issues').count())
  fail(`review shows issues: ${await tid('review-issues').innerText()}`);
await tid('review-send').click();
await page.waitForURL(new RegExp(`/documents/${doc.id}$`), { timeout: 20000 });
await page.waitForTimeout(1000);
await shot('web-details-sent');

// Server state and email.
const { data: sent } = await admin
  .from('documents')
  .select('status, current_signing_order')
  .eq('id', doc.id)
  .single();
if (sent.status !== 'in_progress' || sent.current_signing_order !== 1)
  fail(`document ${JSON.stringify(sent)}`);
const { data: recipients } = await admin
  .from('document_recipients')
  .select('email, status, signing_order')
  .eq('document_id', doc.id)
  .order('signing_order');
if (
  JSON.stringify(recipients.map((r) => [r.email, r.status, r.signing_order])) !==
  JSON.stringify([
    [first, 'sent', 1],
    [second, 'pending', 2],
  ])
)
  fail(`recipients ${JSON.stringify(recipients)}`);
const search = async (to) =>
  (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()).messages ??
  [];
const firstMail = await search(first);
if (firstMail.length !== 1) fail(`first signer received ${firstMail.length} emails`);
if ((await search(second)).length !== 0) fail('second signer was emailed before their turn');
const body = firstMail[0]
  ? (await (await fetch(`${MAILPIT}/api/v1/message/${firstMail[0].ID}`)).json()).Text
  : '';
if (!/Please sign by Friday\./.test(body) || !/\/s\/[A-Za-z0-9_-]{43}/.test(body))
  fail(`email body: ${body}`);

// Locked: the editor is read-only now.
await page.goto(`${APP}/documents/${doc.id}/fields`);
await page
  .waitForSelector("text=This document has been sent, so its fields can't be changed.", { timeout: 20000 })
  .catch(() => fail('editor not locked'));
if (errors.length) fail(`page errors: ${errors.join('; ')}`);
await browser.close();
console.log(
  process.exitCode
    ? 'FAILED'
    : `✓ sent to 2 sequential signers through the app: only ${first} was emailed; draft locked`,
);
