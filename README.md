# SignFlow

Cross-platform (iOS + Android) e-signature app built with Expo + Supabase.

- [`SPEC.md`](./SPEC.md): product & technical specification (source of truth)
- [`prompts/`](./prompts): per-phase implementation prompts ([`phase-1.md`](./prompts/phase-1.md),
  [`phase-2.md`](./prompts/phase-2.md), [`phase-3.md`](./prompts/phase-3.md))
- [`docs/phase-reports/`](./docs/phase-reports): what each phase delivered, test results, open TODOs

**Status:** Phase 1 (foundation) complete. See the [Phase 1 report](./docs/phase-reports/phase-1.md).

## Stack

|              | Version                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| Expo SDK     | **57** (`expo@~57.0.26`, React Native 0.86, React 19.2, New Architecture) |
| Expo Router  | 57 (file-based routes in `app/`)                                          |
| Supabase CLI | 2.119 (dev dependency; local Postgres 17)                                 |
| supabase-js  | 2.117                                                                     |
| TypeScript   | 6.0, `strict` + `noUncheckedIndexedAccess`                                |

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
```

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

`supabase/seed.sql` creates two users, both with the password `SignFlow-dev-123`:

| Email                     | Name            | Dashboard (needs signature / waiting / drafts / completed) |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| `owner@signflow.test`     | John Doe        | 1 / 2 / 1 / 1                                              |
| `recipient@signflow.test` | Aaliyah Fatimah | 1 / 0 / 1 / 1                                              |

Emails sent by local Auth (verification, password reset) land in **Mailpit** at
<http://127.0.0.1:54324>. Open the link on the device or simulator running the app: it deep-links back
via `signflow://auth/callback`.

## Scripts

| Command                    | What it does                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run typecheck`        | `tsc --noEmit`                                                                             |
| `npm run lint`             | ESLint (`eslint-config-expo` + Prettier)                                                   |
| `npm test`                 | Jest + React Native Testing Library (unit and component tests)                             |
| `npm run db:start`         | Start the local Supabase stack                                                             |
| `npm run db:reset`         | Recreate the local database from migrations + `seed.sql`                                   |
| `npm run db:test`          | pgTAP tests in `supabase/tests/database` (run `db:reset` first; one file checks seed data) |
| `npm run test:integration` | End-to-end auth/data tests against the running local stack (`integration/`)                |
| `npm run gen:types`        | Regenerate `src/types/database.ts` from the local schema                                   |

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

## Project structure

```
app/                 Expo Router routes only (thin: they render feature screens)
src/components/      Shared UI (AppButton, AppInput, Card, ListRow, StatusBadge, EmptyState, …)
src/features/        auth, onboarding, home, account, placeholders, dev
src/theme/           Design tokens (SPEC §3), ThemeProvider, status presentation
src/lib/             Supabase client, encrypted session storage, query client/keys, i18n, errors
src/i18n/en.json     All user-facing copy (keys are type-checked)
src/types/           Generated database types
shared/              Zod schemas and error codes shared with Edge Functions (from Phase 2)
supabase/            config.toml, migrations, seed.sql, pgTAP tests
integration/         Tests against the local Supabase stack
```

`/dev/components` (development builds only) renders every shared component in light and dark mode.

## Security notes

- The Supabase session is stored encrypted: an AES-256 key in the Keychain/Keystore (`expo-secure-store`)
  and the ciphertext in AsyncStorage (`src/lib/secureSessionStorage.ts`).
- Row Level Security is enabled on every table, and protected columns (status, storage paths, hashes,
  timestamps) are not writable by clients at all (column privileges). `supabase/tests/database` covers it.
- The audit log (`document_events`) is append-only and can only be written server-side.
