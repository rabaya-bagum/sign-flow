/**
 * Phase 7 in the real web app: the owner gets an in-app notification when a guest opens their
 * document, reads it from the inbox (bell dot on Home), reminds the guest, voids the document with a
 * reason, and finds it all in the Activity tab and the document timeline. Also checks Account →
 * Notifications persists. Needs the web build on APP_URL (default http://localhost:8081) and
 * `npm run functions:serve`.
 *
 *   node tests/e2e/activity-flow.mjs [screenshotDir]
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
const anon = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};
const stamp = Date.now();
const ownerEmail = `activity-owner.${stamp}@signflow.test`;
const guestEmail = `activity-guest.${stamp}@signflow.test`;
const password = 'Activity-e2e-pass1';

// --- A sent document with one guest signer -------------------------------------------------------------
await admin.auth.admin.createUser({
  email: ownerEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Omar Owner' },
});
const { data: auth } = await client.auth.signInWithPassword({ email: ownerEmail, password });
const { data: doc } = await client
  .from('documents')
  .insert({ owner_id: auth.user.id, title: 'Supplier contract' })
  .select('id')
  .single();
await client.storage
  .from('documents')
  .upload(
    `${auth.user.id}/${doc.id}/original.pdf`,
    readFileSync(new URL('../../fixtures/pdf/portrait-3p.pdf', import.meta.url)),
    { contentType: 'application/pdf' },
  );
await client.functions.invoke('process-upload', { body: { document_id: doc.id } });
const { data: rec } = await client
  .from('document_recipients')
  .insert({ document_id: doc.id, name: 'Gina Guest', email: guestEmail, role: 'signer', signing_order: 1 })
  .select('id')
  .single();
await client.rpc('save_document_fields', {
  p_document_id: doc.id,
  p_fields: [
    {
      id: crypto.randomUUID(),
      recipient_id: rec.id,
      page_number: 1,
      type: 'signature',
      x: 0.1,
      y: 0.7,
      width: 0.3,
      height: 0.06,
      required: true,
      properties: {},
    },
  ],
});
const sent = await client.functions.invoke('send-document', { body: { document_id: doc.id } });
if (sent.error) throw sent.error;

async function guestToken() {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${guestEmail}`)}`);
  for (const m of (await res.json()).messages ?? []) {
    const text = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text;
    const match = text.match(/\/s\/([A-Za-z0-9_-]{43})/);
    if (match) return match[1];
  }
  throw new Error('no guest link');
}
// The guest opens the link (as the guest page does): the owner should be notified.
const firstToken = await guestToken();
const opened = await anon.functions.invoke('guest-open', { body: { token: firstToken } });
if (opened.error) throw opened.error;

// --- The owner in the web app -----------------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
await page.goto(APP);
await tid('onboarding-skip').click();
await tid('welcome-sign-in').click();
await tid('sign-in-email').fill(ownerEmail);
await tid('sign-in-password').fill(password);
await tid('sign-in-submit').click();
await tid('home-screen').waitFor({ timeout: 20000 });

// Bell with an unread dot → inbox.
await page
  .waitForFunction(
    () =>
      /unread/.test(
        document.querySelector('[data-testid="home-notifications"]')?.getAttribute('aria-label') ?? '',
      ),
    null,
    { timeout: 15000 },
  )
  .catch(() => fail('no unread indicator on the bell'));
if (out) await page.screenshot({ path: `${out}/web-home-bell.png` });
await tid('home-notifications').click();
await tid('inbox-item-0').waitFor({ timeout: 15000 });
const label = await tid('inbox-item-0').getAttribute('aria-label');
if (!/Gina Guest opened your document, Supplier contract/.test(label ?? '')) fail(`inbox item: ${label}`);
if (out) await page.screenshot({ path: `${out}/web-inbox.png` });
await tid('inbox-item-0').click();
await tid('details-screen').waitFor({ timeout: 15000 });
const { data: readRows } = await admin.from('notifications').select('read_at').eq('user_id', auth.user.id);
if (!readRows.every((r) => r.read_at)) fail('opening the notification did not mark it read');

// Remind the guest from their row.
await tid(`recipient-${rec.id}`).click();
await page.getByText('Remind Gina Guest').click();
await tid('details-notice').waitFor({ timeout: 15000 });
const reminderMail = await (async () => {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${guestEmail}`)}`);
    const hit = ((await res.json()).messages ?? []).find((m) => m.Subject.startsWith('Reminder:'));
    if (hit) return hit;
    await page.waitForTimeout(500);
  }
  return null;
})();
if (!reminderMail) fail('no reminder email');
const reminderToken = await guestToken();
if (reminderToken === firstToken) fail('the reminder did not issue a new link');

// Void with a reason.
await tid('details-void').click();
await tid('void-reason').fill('Prices changed');
await tid('void-confirm').click();
await page.getByText('Voided: Prices changed').waitFor({ timeout: 15000 });
await tid('details-timeline').scrollIntoViewIfNeeded();
if (out) await page.screenshot({ path: `${out}/web-details-voided.png`, fullPage: true });
const timeline = await tid('details-timeline').innerText();
for (const expected of ['Document voided', 'Reminder sent to Gina Guest', 'Document viewed']) {
  if (!timeline.includes(expected)) fail(`timeline lacks "${expected}"`);
}
const voidedOpen = await anon.functions.invoke('guest-open', { body: { token: reminderToken } });
if (voidedOpen.data?.state !== 'voided') fail(`guest link after void: ${JSON.stringify(voidedOpen.data)}`);

// Activity tab.
await page.goto(`${APP}/activity`);
await tid('activity-screen').waitFor({ timeout: 15000 });
await page.getByText('Document voided').first().waitFor({ timeout: 15000 });
await tid('activity-filter-closed').click();
await page.waitForTimeout(800);
const closedOnly = await tid('activity-list').innerText();
if (closedOnly.includes('Reminder sent')) fail('closed filter still shows reminders');
if (out) await page.screenshot({ path: `${out}/web-activity.png` });

// Account → Notifications persists.
await page.goto(`${APP}/account/notifications`);
await tid('prefs-topic-activity').waitFor({ timeout: 15000 });
await tid('prefs-topic-activity').click();
await page.waitForTimeout(800);
const { data: profile } = await admin
  .from('profiles')
  .select('notification_prefs')
  .eq('id', auth.user.id)
  .single();
if (profile.notification_prefs?.topics?.activity !== false)
  fail(`prefs not saved: ${JSON.stringify(profile.notification_prefs)}`);
if (out) await page.screenshot({ path: `${out}/web-notification-prefs.png` });

if (errors.length) fail(`page errors: ${errors.join('; ')}`);
await browser.close();
console.log(
  process.exitCode
    ? 'FAILED'
    : '✓ open → inbox notice (bell dot) → remind (new link) → void with reason (link closed) → timeline, Activity filter, notification prefs saved',
);
