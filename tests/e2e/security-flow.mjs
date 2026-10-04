/**
 * Phase 8 in the real web app: Account → Security. Turns on two-factor with an authenticator code,
 * signs out other devices, signs in again through the code challenge, changes the password and
 * deletes the account. Needs the web build on APP_URL (default http://localhost:8081) and
 * `npm run functions:serve`.
 *
 *   node tests/e2e/security-flow.mjs [screenshotDir]
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';

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
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fresh = () => createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};

/** RFC 6238 code, as an authenticator app shows it. */
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s|=/g, '').toUpperCase()]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

const stamp = Date.now();
const email = `security.${stamp}@signflow.test`;
const password = 'Security-e2e-pass1';
const newPassword = 'Security-e2e-pass2';
const { data: created } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Sam Secure' },
});
// Another device, signed in before 2FA is turned on.
const otherDevice = fresh();
const { data: otherSession } = await otherDevice.auth.signInWithPassword({ email, password });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
const signIn = async (pass) => {
  await tid('sign-in-email').fill(email);
  await tid('sign-in-password').fill(pass);
  await tid('sign-in-submit').click();
};

await page.goto(APP);
await tid('onboarding-skip').click();
await tid('welcome-sign-in').click();
await signIn(password);
await tid('home-screen').waitFor({ timeout: 20000 });

// --- Two-factor on -----------------------------------------------------------------------------------
await page.goto(`${APP}/account/security`);
await tid('security-screen').waitFor({ timeout: 15000 });
if (out) await page.screenshot({ path: `${out}/web-security.png` });
await tid('security-two-factor').click();
await tid('two-factor-start').click();
const secret = (await tid('two-factor-secret').innerText()).replace(/\s/g, '');
if (out) await page.screenshot({ path: `${out}/web-two-factor-setup.png`, fullPage: true });
const setupCode = totp(secret);
await tid('two-factor-setup-code').fill(setupCode);
await tid('two-factor-confirm').click();
await page.getByText('Two-factor authentication is on.').waitFor({ timeout: 15000 });

// --- Sign out other devices --------------------------------------------------------------------------
await page.goto(`${APP}/account/security`);
await tid('security-other-devices').click();
await page.getByText('Sign out others').click();
await page.getByText('Other devices have been signed out.').waitFor({ timeout: 15000 });
const { error: refreshError } = await fresh().auth.refreshSession({
  refresh_token: otherSession.session.refresh_token,
});
if (!refreshError) fail('the other device could still refresh its session');

// --- Sign out, then sign in through the code challenge -----------------------------------------------
await page.goto(`${APP}/account`);
await tid('account-logout').click();
await page.getByText('Log out', { exact: true }).last().click();
await tid('welcome-sign-in').click({ timeout: 15000 });
await signIn(password);
await tid('two-factor-challenge').waitFor({ timeout: 15000 });
if (out) await page.screenshot({ path: `${out}/web-two-factor-challenge.png` });
await tid('two-factor-code').fill(setupCode === '000000' ? '111111' : '000000');
await tid('two-factor-verify').click();
await page.getByText(/That code isn't right/).waitFor({ timeout: 15000 });
// A code is single-use: wait for the next 30-second window if the setup code is still current.
while (totp(secret) === setupCode) await page.waitForTimeout(1000);
await tid('two-factor-code').fill(totp(secret));
await tid('two-factor-verify').click();
await tid('home-screen').waitFor({ timeout: 20000 });

// --- Change password (signed in moments ago, so no emailed code is needed) ---------------------------
await page.goto(`${APP}/account/security`);
await tid('security-password').click();
await tid('change-password-new').fill(newPassword);
await tid('change-password-confirm').fill(newPassword);
await tid('change-password-submit').click();
await tid('change-password-screen')
  .waitFor({ state: 'detached', timeout: 15000 })
  .catch(async () => fail(`password not changed: ${await page.locator('body').innerText()}`.slice(0, 600)));
const { error: newPasswordError } = await fresh().auth.signInWithPassword({ email, password: newPassword });
if (newPasswordError) fail(`new password refused: ${newPasswordError.message}`);

// --- Delete the account ------------------------------------------------------------------------------
await page.goto(`${APP}/account/delete`);
await tid('delete-account-screen').waitFor({ timeout: 15000 });
if (out) await page.screenshot({ path: `${out}/web-delete-account.png`, fullPage: true });
await tid('delete-account-password').fill(newPassword);
await tid('delete-account-submit').click();
await page.getByText('Delete permanently').click();
await tid('welcome-sign-in').waitFor({ timeout: 20000 });
const { data: profile } = await admin
  .from('profiles')
  .select('deleted_at, phone')
  .eq('id', created.user.id)
  .single();
if (!profile?.deleted_at) fail('profile not marked deleted');
const { error: afterDelete } = await fresh().auth.signInWithPassword({ email, password: newPassword });
if (!afterDelete) fail('a deleted account could still sign in');

if (errors.length) fail(`page errors: ${errors.join('; ')}`);
await browser.close();
console.log(
  process.exitCode
    ? 'FAILED'
    : '✓ 2FA on → other devices signed out → sign-in asks for the code (wrong code refused) → password changed → account deleted (signed out, sign-in refused)',
);
