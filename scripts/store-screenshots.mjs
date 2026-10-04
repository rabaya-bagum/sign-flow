/**
 * Draft store screenshots from the web build at iPhone 6.7" size (1290×2796). Final store images
 * should come from device builds (native fonts, status bar); these show the layout and copy.
 * Needs the web export on APP_URL (default http://localhost:8081) and functions:serve.
 *
 *   node scripts/store-screenshots.mjs [outDir=docs/release/screenshots]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const out = process.argv[2] ?? 'docs/release/screenshots';
mkdirSync(out, { recursive: true });
const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString(),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pdf = readFileSync(new URL('../fixtures/pdf/portrait-3p.pdf', import.meta.url));
const stamp = Date.now();
const password = 'Store-shots-pass1';

async function account(name, label) {
  const email = `${label}.${stamp}@signflow.test`;
  await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  return { email, id: data.user.id, client };
}
async function document(owner, title, recipients, send = true) {
  const { data: doc } = await owner.client
    .from('documents')
    .insert({ owner_id: owner.id, title })
    .select('id')
    .single();
  await owner.client.storage
    .from('documents')
    .upload(`${owner.id}/${doc.id}/original.pdf`, pdf, { contentType: 'application/pdf' });
  await owner.client.functions.invoke('process-upload', { body: { document_id: doc.id } });
  const fields = [];
  for (const [i, r] of recipients.entries()) {
    const { data: rec } = await owner.client
      .from('document_recipients')
      .insert({ document_id: doc.id, name: r.name, email: r.email, role: 'signer', signing_order: 1 })
      .select('id')
      .single();
    fields.push({
      id: crypto.randomUUID(),
      recipient_id: rec.id,
      page_number: 1,
      type: 'signature',
      x: 0.1,
      y: 0.6 + i * 0.12,
      width: 0.35,
      height: 0.07,
      required: true,
      properties: {},
    });
  }
  await owner.client.rpc('save_document_fields', { p_document_id: doc.id, p_fields: fields });
  if (send) await owner.client.functions.invoke('send-document', { body: { document_id: doc.id } });
  return doc.id;
}

const me = await account('Jordan Lee', 'store-me');
const partner = await account('Priya Shah', 'store-partner');
const waiting = await document(me, 'Office lease 2027', [
  { name: 'Priya Shah', email: partner.email },
  { name: 'Marco Diaz', email: `marco.${stamp}@signflow.test` },
]);
await document(
  me,
  'Freelance agreement',
  [{ name: 'Sam Taylor', email: `sam.${stamp}@signflow.test` }],
  false,
);
const toSign = await document(partner, 'Vendor NDA', [{ name: 'Jordan Lee', email: me.email }]);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });
const page = await context.newPage();
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
const shot = async (name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
};
await page.goto(APP);
await shot('01-onboarding');
await tid('onboarding-skip').click();
await tid('welcome-sign-in').click();
await tid('sign-in-email').fill(me.email);
await tid('sign-in-password').fill(password);
await tid('sign-in-submit').click();
await tid('home-screen').waitFor({ timeout: 20000 });
await shot('02-home');
await page.goto(`${APP}/documents`);
await tid('documents-screen').waitFor();
await shot('03-documents');
await page.goto(`${APP}/documents/${waiting}`);
await tid('details-screen').waitFor();
await shot('04-tracking');
await page.goto(`${APP}/documents/${toSign}`);
await tid('details-sign').click();
await tid('consent-agree').click();
await tid('signing-screen').waitFor({ timeout: 20000 });
await shot('05-signing');
await page.goto(`${APP}/account/security`);
await tid('security-screen').waitFor();
await shot('06-security');
await browser.close();
console.log(`✓ screenshots in ${out}`);
