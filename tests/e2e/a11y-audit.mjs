/**
 * Accessibility audit of the web build (SPEC §16, Phase 8): runs axe-core (WCAG 2.1 A/AA rules) on
 * every main screen and checks the 44×44 pt minimum touch target. Fails on serious or critical
 * violations. Needs the web export on APP_URL (default http://localhost:8081) and functions:serve.
 *
 *   node tests/e2e/a11y-audit.mjs [--json out.json]
 *
 * Native screen readers (VoiceOver/TalkBack) and Dynamic Type still need a device pass; see
 * docs/accessibility-audit.md.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const APP = process.env.APP_URL ?? 'http://localhost:8081';
const MAILPIT = 'http://127.0.0.1:54324';
const verbose = process.argv.includes('--verbose');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString(),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });

// --- A user with a sent document (details, activity) and a guest link (signing page) -----------------
const stamp = Date.now();
const email = `a11y.${stamp}@signflow.test`;
const guestEmail = `a11y-guest.${stamp}@signflow.test`;
const password = 'A11y-audit-pass1';
await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Alex Audit' },
});
const { data: auth } = await client.auth.signInWithPassword({ email, password });
const { data: doc } = await client
  .from('documents')
  .insert({ owner_id: auth.user.id, title: 'Audit lease' })
  .select('id')
  .single();
await client.storage
  .from('documents')
  .upload(
    `${auth.user.id}/${doc.id}/original.pdf`,
    readFileSync(new URL('../../fixtures/pdf/portrait-3p.pdf', import.meta.url)),
    {
      contentType: 'application/pdf',
    },
  );
await client.functions.invoke('process-upload', { body: { document_id: doc.id } });
const { data: rec } = await client
  .from('document_recipients')
  .insert({ document_id: doc.id, name: 'Gus Guest', email: guestEmail, role: 'signer', signing_order: 1 })
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
const { data: draft } = await client
  .from('documents')
  .insert({ owner_id: auth.user.id, title: 'Audit draft' })
  .select('id')
  .single();
await client.storage
  .from('documents')
  .upload(
    `${auth.user.id}/${draft.id}/original.pdf`,
    readFileSync(new URL('../../fixtures/pdf/portrait-3p.pdf', import.meta.url)),
    {
      contentType: 'application/pdf',
    },
  );
await client.functions.invoke('process-upload', { body: { document_id: draft.id } });
await client.from('document_recipients').insert({
  document_id: draft.id,
  name: 'Rae Recipient',
  email: `a11y-rae.${stamp}@signflow.test`,
  role: 'signer',
  signing_order: 1,
});
const sent = await client.functions.invoke('send-document', { body: { document_id: doc.id } });
if (sent.error) throw sent.error;
const search = await (
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${guestEmail}`)}`)
).json();
const mailText = (await (await fetch(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`)).json()).Text;
const guestToken = mailText.match(/\/s\/([A-Za-z0-9_-]{43})/)[1];

// --- Audit ------------------------------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();

async function audit(name) {
  await page.waitForTimeout(600);
  await page.evaluate(AXE);
  const result = await page.evaluate(() =>
    // The PDF surface iframe is a canvas viewer audited separately (tests/surface).
    window.axe.run({ exclude: [['iframe']] }, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }),
  );
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(
      '[role="button"],[role="link"],[role="switch"],[role="checkbox"],[role="tab"],button,input,a[href]',
    )) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!r.width || !r.height || style.visibility === 'hidden') continue;
      // Inline text links inside sentences are exempt (WCAG 2.5.8 inline exception).
      if (el.closest('[data-inline-link]')) continue;
      // A small control inside a larger tappable row (e.g. a switch row) is reached through the row.
      let row = el.parentElement;
      for (let i = 0; row && i < 3; i++, row = row.parentElement) {
        const rr = row.getBoundingClientRect();
        if (getComputedStyle(row).cursor === 'pointer' && rr.width >= 44 && rr.height >= 44) break;
      }
      if (row && getComputedStyle(row).cursor === 'pointer') continue;
      if (r.width < 44 || r.height < 44)
        out.push(
          `${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName} (${Math.round(r.width)}×${Math.round(r.height)})`,
        );
    }
    return out;
  });
  return {
    screen: name,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.target?.join(' '),
      html: v.nodes.slice(0, 2).map((n) => `${n.html.slice(0, 240)} → ${n.failureSummary}`),
    })),
    passes: result.passes.length,
    smallTargets: small,
  };
}

const results = [];
await page.goto(APP);
results.push(await audit('Onboarding'));
await tid('onboarding-skip').click();
results.push(await audit('Welcome'));
await tid('welcome-sign-in').click();
await tid('sign-in-email').waitFor();
results.push(await audit('Sign in'));
await tid('sign-in-email').fill(email);
await tid('sign-in-password').fill(password);
await tid('sign-in-submit').click();
await tid('home-screen').waitFor({ timeout: 20000 });
results.push(await audit('Home'));
const visit = async (path, testId, name) => {
  await page.goto(`${APP}${path}`);
  await tid(testId).waitFor({ timeout: 20000 });
  results.push(await audit(name));
};
await visit('/documents', 'documents-screen', 'Documents');
await visit(`/documents/${doc.id}`, 'details-screen', 'Document details');
await visit('/activity', 'activity-screen', 'Activity');
await visit('/notifications', 'inbox-screen', 'Inbox');
await visit('/account', 'account-screen', 'Account');
await visit('/account/security', 'security-screen', 'Security');
await visit('/account/two-factor', 'two-factor-setup', 'Two-factor setup');
await visit('/account/delete', 'delete-account-screen', 'Delete account');
await visit('/account/notifications', 'notification-prefs', 'Notification settings');
await visit('/documents/new/source', 'source-screen', 'New document: source');
await visit(`/documents/${draft.id}/fields`, 'field-editor', 'Field editor');
await visit(`/s/${guestToken}`, 'consent-sheet', 'Guest signing page (consent)');
await tid('consent-agree').click();
await tid('signing-screen').waitFor({ timeout: 20000 });
results.push(await audit('Guest signing page (signing)'));
await browser.close();

// --- Report -----------------------------------------------------------------------------------------
let failed = false;
for (const r of results) {
  const blocking = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (blocking.length) failed = true;
  console.log(
    `${blocking.length ? '✗' : '✓'} ${r.screen}: ${r.violations.length} violations (${blocking.length} serious/critical), ${r.passes} rules passed, ${r.smallTargets.length} small targets`,
  );
  for (const v of r.violations) console.log(`    [${v.impact}] ${v.id}: ${v.help} ×${v.nodes} (${v.sample})`);
  if (verbose)
    for (const v of r.violations) for (const h of v.html) console.log(`      ${h.replace(/\n/g, ' ')}`);
  for (const s of r.smallTargets) console.log(`    target < 44pt: ${s}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exitCode = failed ? 1 : 0;
