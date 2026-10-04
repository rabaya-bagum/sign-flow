# SignFlow

Cross-platform (iOS + Android) e-signature app built with Expo + Supabase.

- [`SPEC.md`](./SPEC.md): product & technical specification (source of truth)
- [`prompts/`](./prompts): per-phase implementation prompts ([`phase-1.md`](./prompts/phase-1.md),
  [`phase-2.md`](./prompts/phase-2.md), [`phase-3.md`](./prompts/phase-3.md))
- [`docs/phase-reports/`](./docs/phase-reports): what each phase delivered, test results, open TODOs

**Status:** Phase 5 (recipients & send) complete. Phase reports: [1](./docs/phase-reports/phase-1.md),
[2](./docs/phase-reports/phase-2.md), [3](./docs/phase-reports/phase-3.md), [4](./docs/phase-reports/phase-4.md), [5](./docs/phase-reports/phase-5.md).

## Stack

|                | Version                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| Expo SDK       | **57** (`expo@~57.0.26`, React Native 0.86, React 19.2, New Architecture) |
| Expo Router    | 57 (file-based routes in `app/`)                                          |
| Supabase CLI   | 2.119 (dev dependency; local Postgres 17)                                 |
| supabase-js    | 2.117                                                                     |
| TypeScript     | 6.0, `strict` + `noUncheckedIndexedAccess`                                |
| Edge Functions | Deno 2 (`deno` dev dependency for tests); `pdf-lib` 1.17.1, `zod` 4       |
| PDF rendering  | `pdfjs-dist` 6.3.289 in `react-native-webview` 13.16 (iframe on web)      |
| Signatures     | `@shopify/react-native-skia` 2.6 (CanvasKit wasm on web)                  |

Expo Go is **not** supported: the app uses native modules (secure storage, Apple/Google sign-in), so
run it in a development build.

## Prerequisites

- Node.js 22+ and npm
- Docker (for the local Supabase stack)
- For device builds: an [Expo account](https://expo.dev) and EAS CLI (`npx eas-cli@latest`), or
  Xcode / Android Studio for local native builds

## Getting started

```bash
npm install
cp .env.example .env

# Start Postgres, Auth, Storage, Mailpit… (first run pulls Docker images)
npm run db:start

# In another terminal: serve the Edge Functions (uploads, downloads, sending, signing)
npm run functions:serve
```

Uploads, downloads, sending and signing go through Edge Functions, so keep `functions:serve` running while
using the app locally. The functions need no extra secrets: the local runtime provides `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

`db:start` prints `API_URL` and `ANON_KEY` (or `PUBLISHABLE_KEY`). Put them in `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
```

From a physical device, use your computer's LAN IP instead of `127.0.0.1` (Android emulator:
`10.0.2.2`). Only `EXPO_PUBLIC_*` values reach the app. **Never put a service-role/secret key in `.env`.**

### Run the app

```bash
# Development build in the cloud (iOS simulator build; use development-device for a phone)
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android

# …or build locally with Xcode / Android Studio installed
npm run ios
npm run android

# Then start Metro for the installed dev build
npm start
```

`npm run web` also works for quick UI checks (Apple/Google sign-in are native-only).

### Seed users (local only)

`supabase/seed.sql` creates two users, both with the password `SignFlow-dev-123`. Their documents have
real PDF files: `supabase/seed/storage/documents` is uploaded by `db:reset` (`objects_path` in
`config.toml`) and linked by the generated `supabase/seed/seed_documents.sql`.

| Email                     | Name            | Dashboard (needs signature / waiting / drafts / completed) |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| `owner@signflow.test`     | John Doe        | 1 / 2 / 1 / 1                                              |
| `recipient@signflow.test` | Aaliyah Fatimah | 1 / 0 / 1 / 1                                              |

Emails sent by local Auth (verification, password reset) land in **Mailpit** at
<http://127.0.0.1:54324>. Open the link on the device or simulator running the app: it deep-links back
via `signflow://auth/callback`.

## Scripts

| Command                               | What it does                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                   | `tsc --noEmit`                                                                                                            |
| `npm run lint`                        | ESLint (`eslint-config-expo` + Prettier)                                                                                  |
| `npm test`                            | Jest + React Native Testing Library (unit and component tests)                                                            |
| `npm run db:start`                    | Start the local Supabase stack                                                                                            |
| `npm run db:reset`                    | Recreate the local database from migrations + `seed.sql`                                                                  |
| `npm run db:test`                     | pgTAP tests in `supabase/tests/database` (run `db:reset` first; one file checks seed data)                                |
| `npm run test:integration`            | End-to-end tests against the running stack: auth, Storage/TUS uploads, functions over HTTP (needs `functions:serve`)      |
| `npm run test:functions`              | Deno tests for Edge Function logic against the local stack (`supabase/functions/tests`), incl. a 25 MB / 200-page timing  |
| `npm run functions:serve`             | Serve Edge Functions locally (hot reload)                                                                                 |
| `npm run fixtures`                    | Regenerate PDF/image fixtures and the seed originals (`scripts/generate-fixtures.ts`)                                     |
| `npm run gen:types`                   | Regenerate `src/types/database.ts` from the local schema                                                                  |
| `npm run build:surface`               | Rebuild the offline PDF surface `assets/pdf-surface/surface.html` from `web/pdf-surface` (commit the result)              |
| `npm run check:surface`               | Fail if `surface.html` is stale (also covered by Jest)                                                                    |
| `npm run test:surface`                | PDF surface in Chromium (Playwright): worker + main-thread fallback, errors, invalid commands, taps                       |
| `npm run test:golden`                 | Golden raster test: shapes stamped by `stamp.ts`, rendered by the surface, must land within ±1 pt                         |
| `npm run check:dev-routes`            | Export production bundles (web, Android) and fail if any `/dev/*` screen code is included                                 |
| `node tests/e2e/editor-roundtrip.mjs` | Field editor E2E on the web build (port 8081; needs `functions:serve`): place, drag, reload, compare with the DB          |
| `node tests/e2e/send-flow.mjs`        | Recipients → fields → review & send in the web build; checks the emails in Mailpit                                        |
| `node tests/e2e/activity-flow.mjs`    | Inbox notice → remind → void → timeline and Activity tab; notification settings saved                                     |
| `node tests/e2e/signing-flow.mjs`     | Owner signs in the app, guest signs by link, CC copied; checks completion emails, attachments and certificate hashes      |
| `node tests/e2e/security-flow.mjs`    | Two-factor on → other devices signed out → sign-in code challenge → change password → delete account                      |
| `node tests/e2e/a11y-audit.mjs`       | axe-core (WCAG 2.1 AA) and 44 pt touch targets on 17 screens of the web build; fails on serious/critical issues           |
| `node scripts/store-screenshots.mjs`  | Draft store screenshots (1290×2796) from the web build into `docs/release/screenshots`                                    |
| `npm run audit:deps`                  | Fail on high/critical npm advisories not accepted in `security/audit-allowlist.json` (runs in CI)                         |
| `npm run check:functions`             | Every Edge Function folder has a `deno.json` mapping `zod` (runs in CI)                                                   |
| `maestro test e2e/maestro`            | Native E2E on iOS/Android builds (sign a request, security, delete account); seed with `node scripts/e2e/seed-native.mjs` |
| `npm run functions:deploy`            | Deploy the production Edge Functions (explicit list; never `dev-stamp`)                                                   |

After changing a migration: `npm run db:reset && npm run gen:types && npm run db:test`.

## Configuration

### Auth redirect URLs

Email links redirect to `signflow://auth/callback?flow=signup|recovery` (on web,
`http://localhost:8081/auth/callback…`). The local allow-list is `auth.additional_redirect_urls` in
`supabase/config.toml`. Add the same entries to your hosted project under
**Authentication → URL Configuration**.

Local Auth matches production policy: email confirmation is required and passwords need 10+
characters with letters and digits.

### Sign in with Apple (iOS)

1. In the Apple Developer portal, enable _Sign in with Apple_ for your App ID (the bundle ID defaults to
   the placeholder `com.example.signflow`; set `SIGNFLOW_BUNDLE_ID` to override).
2. In Supabase (**Authentication → Providers → Apple**), enable Apple and add your bundle ID to the
   client IDs. Native sign-in uses an ID token, so no OAuth secret is needed for iOS-only use.
3. Rebuild the dev client. The button only appears on iOS devices where Apple sign-in is available.

### Google sign-in

1. In Google Cloud Console, create OAuth client IDs: **Web** (used as `webClientId`, also for
   Android), **iOS**, and **Android** (with your package name and signing SHA-1).
2. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and
   `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` (the reversed iOS client ID) in `.env`, then rebuild. The config
   plugin is only added when the URL scheme is set.
3. In Supabase (**Authentication → Providers → Google**), enable Google, add the web client ID and
   secret, and add the iOS/Android client IDs to _Authorized Client IDs_. Enable **Skip nonce check**,
   which iOS native sign-in requires (already set in local `config.toml`).

The Google button is hidden until `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set.

### Storage

Buckets are created by migration (`20261003000900_storage.sql`) and are all private:

| Bucket        | Contents                                             | Client access                                                                   |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `documents`   | `{owner}/{document}/original.pdf` (≤ 25 MB, PDF)     | Insert own draft's original once; reads via signed URLs from `get-download-url` |
| `uploads-tmp` | Scans/photos awaiting conversion (≤ 10 MB, JPEG/PNG) | Own folder only; deleted by `process-upload`                                    |
| `avatars`     | `{user}/avatar.jpg` (≤ 2 MB)                         | Write own; signed-in users read via signed URLs                                 |
| `signatures`  | `{user}/{id}.png` (≤ 1 MB, PNG)                      | Owner only (read, insert, delete); shown through 5-minute signed URLs           |

Files over 6 MB upload through Storage's resumable (TUS) endpoint with progress, cancel and automatic
resume (`src/features/upload/resumable.ts`).

### Email

`send-document` (and later notifications) sends through `supabase/functions/_shared/email`. In
production set the function secrets `RESEND_API_KEY`, `EMAIL_FROM` (a verified Resend sender) and
`PUBLIC_SIGNING_URL` (the web app origin serving `/s/<token>`). Locally, copy
`supabase/functions/.env.example` to `supabase/functions/.env`: mail goes to the stack's Mailpit, readable
at <http://127.0.0.1:54324>.

### Signing links

Guests sign at `PUBLIC_SIGNING_URL/s/<token>`: the same Expo Router route, served by the web export
(`npx expo export --platform web`, `web.output: 'single'`, so the host must fall back to `index.html` for
unknown paths). To open the app instead when it is installed, build with
`SIGNFLOW_SIGNING_DOMAIN=<host>` (adds iOS associated domains and an Android App Link intent filter for
`https://<host>/s/*`) and serve, from that host:

- `/.well-known/apple-app-site-association` with an `applinks` entry for `<TEAMID>.<bundle id>` and the
  path `/s/*`;
- `/.well-known/assetlinks.json` with the Android package and the release signing certificate SHA-256.

Optional: `EXPO_PUBLIC_APP_DOWNLOAD_URL` shows "Get the SignFlow app" on the guest pages.

Completed documents: the flattened PDF and the certificate are emailed to everyone (attached up to
15 MB together; always with a link). Guests get a 30-day download link; people with an account open the
document in the app.

### Reminders and expiry

`cron-tick` runs every 15 minutes from `pg_cron` (scheduled by the migration). It sends due reminders,
"expires tomorrow" emails, expires overdue documents, retries a failed finalization and deletes abandoned
`uploads-tmp` images. The job POSTs to the function with a shared secret, both read from Vault:

```sql
-- Production (once per project; locally supabase/seed.sql does this):
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/cron-tick', 'cron_tick_url');
select vault.create_secret('<long random value>', 'cron_tick_secret');
```

Set the same value as the function secret `CRON_SECRET`. Without the Vault secrets the job does nothing.
To trigger a run locally: `select public.run_cron_tick();` (as `postgres`).

### Push notifications

Push uses Expo push tokens (`expo-notifications`), so builds need an EAS project: run `eas init` and
build with `EAS_PROJECT_ID=<id>`. Without it the app runs normally and the push switch is disabled.
Push needs a development or store build on a real device (not Expo Go, simulators or the web). Function
secret `EXPO_ACCESS_TOKEN` is only needed if "enhanced push security" is on for the project. Everyone
also gets every notice in the in-app inbox (bell on Home).

### Two-factor, password changes and account deletion

Turn these on in the hosted project's Auth settings to match `supabase/config.toml`:

- **MFA → TOTP:** enroll and verify enabled. The database and functions then require an `aal2` session
  from anyone with a verified factor (`20261009000200_mfa.sql`).
- **Secure password change:** on. Changing the password without a recent sign-in asks for a code sent by
  email.

Account deletion (Account → Delete account) is the `delete-account` function. It needs no extra
secrets. What is kept for other participants is described in `docs/security-checklist.md` §6.

### Crash reporting (Sentry)

This is optional: set `EXPO_PUBLIC_SENTRY_DSN` (and `EXPO_PUBLIC_APP_ENV`) to turn it on.

- **Source maps in EAS builds:** set `SENTRY_ORG` and `SENTRY_PROJECT`, and add `SENTRY_AUTH_TOKEN` as
  an EAS secret.
- **What is sent:** events are scrubbed on the device (`src/lib/scrub.ts`), with no screenshots, view
  hierarchy or console breadcrumbs. Also turn on server-side data scrubbing in the Sentry project.

### Biometric unlock

`expo-local-authentication` needs a development or store build (Face ID usage string in
`app.config.ts`). It is hidden on the web.

### Fonts and licences

Typed signatures use three script fonts bundled in [`assets/fonts`](./assets/fonts), all under the
SIL Open Font License 1.1 (licence files alongside):

| Font                    | Licence file            |
| ----------------------- | ----------------------- |
| Dancing Script SemiBold | `OFL-DancingScript.txt` |
| Great Vibes Regular     | `OFL-GreatVibes.txt`    |
| Caveat Medium           | `OFL-Caveat.txt`        |

### Skia on web

Signature drawing uses Skia. On web it runs on CanvasKit (wasm), which `npm install` copies to
`public/canvaskit.wasm` (postinstall `setup-skia-web`; not committed). Skia screens are loaded lazily
after CanvasKit (`src/lib/skia.web.ts`). Use `npx expo start --web` or a production export; a static
`expo export --dev` build reloads when it loads those lazy chunks.

### Behind a TLS-intercepting proxy

If `npm run test:functions` or `npm run fixtures` cannot download npm/JSR packages because of a corporate
proxy certificate, point Deno at your CA bundle: `DENO_CERT=/path/to/ca.pem npm run test:functions`.

## Project structure

```
app/                 Expo Router routes only (thin: they render feature screens)
src/components/      Shared UI (AppButton, AppInput, Card, ListRow, StatusBadge, EmptyState, …)
src/features/        auth, onboarding, home, documents, upload, search, account, viewer, placeholders, dev
src/theme/           Design tokens (SPEC §3), ThemeProvider, status presentation
src/lib/             Supabase client, encrypted session storage, query client/keys, i18n, errors
src/i18n/en.json     All user-facing copy (keys are type-checked)
src/types/           Generated database types
shared/              Zod schemas, limits, error codes, geometry and the PDF bridge (also imported by Edge Functions)
web/pdf-surface/     Source of the offline PDF surface (pdf.js); built into assets/pdf-surface/surface.html
tests/surface/       Playwright tests for the surface (behaviour, golden raster, performance, web round trip)
supabase/            config.toml, migrations, seed.sql + seed/, pgTAP tests
supabase/functions/  Edge Functions (one folder each), _shared/ conventions, Deno tests
fixtures/            PDF/image test inputs (generated by scripts/generate-fixtures.ts)
integration/         Tests against the local Supabase stack
```

Development builds only (absent from production bundles, checked by `npm run check:dev-routes`):

- `/dev/components` renders every shared component in light and dark mode.
- `/dev/coordinate-spike` is the Phase 3 coordinate round trip: tap a fixture to place boxes, press
  **Stamp**, and compare with the stamped PDF. It needs the dev-only `dev-stamp` function: copy
  `supabase/functions/.env.example` to `supabase/functions/.env` (sets `DEV_TOOLS=true`), then
  `npm run functions:serve`. `dev-stamp` refuses every request without `DEV_TOOLS=true` and is not in
  `functions:deploy`. **Never set `DEV_TOOLS` on a hosted project.**

### PDF surface

Documents render in one offline pdf.js "surface" (`web/pdf-surface`, built into a single HTML file by
`npm run build:surface`), used by `src/features/viewer/PdfSurface` in a locked-down WebView on
iOS/Android and in a sandboxed iframe on web. The bridge protocol is `shared/pdfBridge.ts`. Change the
surface's source, then rebuild and commit `assets/pdf-surface/surface.html`; a Jest test fails if it is
stale. `node tests/surface/web-roundtrip.mjs` drives `/dev/coordinate-spike` end-to-end in Chromium
against a dev web build on port 8081.

## Security notes

- The Supabase session is stored encrypted: an AES-256 key in the Keychain/Keystore (`expo-secure-store`)
  and the ciphertext in AsyncStorage (`src/lib/secureSessionStorage.ts`).
- Row Level Security is enabled on every table, and protected columns (status, storage paths, hashes,
  timestamps) are not writable by clients at all (column privileges). `supabase/tests/database` covers it.
- The audit log (`document_events`) is append-only and can only be written server-side.
- Document files are never readable directly: downloads use 5-minute signed URLs issued after an access
  check, and every download is audited. Processed originals cannot be overwritten.
- Signing links carry a random 256-bit token; only its SHA-256 is stored. Every guest call re-validates
  it and is rate-limited per token and per IP. Optional email codes are hashed, expire after 10 minutes
  and allow 5 attempts. Links stop working when the document ends (or a newer link is sent).
- Signing state changes (values, group advance, decline, completion) run in database functions that lock
  the document row, so concurrent submissions cannot both finalize or skip a signer.
- With two-factor on, every table, bucket and Edge Function refuses sessions that have not passed the
  code (`aal2`).
- Every signed-in caller has an overall ceiling of 300 function calls a minute, below the per-action limits.
- The full review is in `docs/security-checklist.md`. Accessibility is in `docs/accessibility-audit.md`.
  Store copy and privacy labels are in `docs/release/`.
