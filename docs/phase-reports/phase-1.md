# Phase 1 report: Foundation

**Branch:** `claude/eloquent-gauss-euba41` · **Date:** 2026-10-03 · **Prompt:** [`prompts/phase-1.md`](../../prompts/phase-1.md)

## 1. Summary

Phase 1 delivers the SignFlow foundation on **Expo SDK 57** (React Native 0.86, Expo Router 57, TypeScript 6
strict) and a local **Supabase** stack (CLI 2.119, Postgres 17):

- **Design system:** SPEC §3 tokens for light and dark, verified against WCAG AA by tests. Two placeholder
  colours were darkened to pass (see §7). There are 16 shared components with accessibility roles and
  labels, plus a dev-only gallery at `/dev/components`.
- **Navigation:** route groups `(onboarding)`, `(auth)` and `(app)/(tabs)` are switched by
  `Stack.Protected` guards from auth state, the onboarding flag and recovery mode. The splash screen
  stays up until the session and preferences are restored.
- **Auth:** email/password sign-up with required verification, sign-in, forgot and reset password,
  and resend with a 60 s cooldown. Email links use **PKCE** through `signflow://auth/callback`.
  - Sign in with Apple uses a SHA-256 nonce; Google uses the native ID token.
  - Sessions are stored **encrypted**: an AES-256 key in SecureStore and the ciphertext in AsyncStorage.
  - `link_recipients_to_user()` runs once per signed-in user.
- **Database:** the Phase 1 tables from SPEC §8 (all columns, including later-phase ones), access
  helpers, RLS per the §14 matrix, **column-level privileges** on server-only fields, an append-only
  audit log, the `public_profiles` view, and the dashboard RPCs built on one `my_documents()` function
  (SPEC §6.3).
- **Home:** real data from `get_dashboard_summary()` and `list_recent_documents(5)`, with skeletons,
  pull-to-refresh, empty and error states (with retry), and navigation to a filtered Documents tab.
- **Account:** profile view and edit, theme (applied locally right away and saved to the profile),
  legal links and log out with confirmation. Later-phase sections are visible but disabled and labelled.

## 2. Files

```
app/                         routes only
  _layout.tsx index.tsx
  (onboarding)/{_layout,onboarding}.tsx
  (auth)/{_layout,welcome,sign-in,sign-up,forgot-password,verify-email,reset-password}.tsx
  auth/callback.tsx
  dev/components.tsx
  (app)/_layout.tsx  (app)/{search,notifications}.tsx  (app)/documents/{new,[id]/index}.tsx
  (app)/(tabs)/{_layout,home,documents,activity}.tsx  (app)/(tabs)/account/{_layout,index,profile,preferences}.tsx
src/
  components/   AppButton AppInput AppText Avatar Card Checkbox ConfirmationModal ControlledInput EmptyState
                ErrorState IconButton InlineAlert ListRow LoadingSkeleton Screen SectionHeader StatusBadge TextLink
  features/auth/        api socialAuth store redirect AuthProvider screens/*
  features/home/        api hooks buckets HomeScreen SummaryCard RecentDocumentRow
  features/account/     api hooks themeLabels AccountScreen ProfileScreen PreferencesScreen
  features/onboarding/  OnboardingScreen
  features/placeholders/ PlaceholderScreen DocumentsPlaceholderScreen ActivityPlaceholderScreen
  features/dev/         ComponentGallery
  theme/        tokens status contrast ThemeProvider useTheme
  lib/          env supabase secureSessionStorage queryClient queryKeys i18n errors openLink
  hooks/        useValidationMessage useAppErrorMessage useCountdown useRelativeTime
  store/        preferences
  i18n/en.json  constants/{legal,limits}.ts  types/{database.ts (generated), i18next.d.ts}  utils/relativeTime.ts
shared/         auth.ts (Zod schemas) errors.ts (AppError codes)
supabase/       config.toml seed.sql migrations/* tests/database/*
integration/    auth.integration.test.ts localSupabase.ts
app.config.ts eas.json tsconfig.json eslint.config.js .prettierrc jest.setup.ts jest.integration.config.js .env.example
```

## 3. Migrations

| File                                        | Purpose                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `20261003000100_extensions_and_enums.sql`   | `citext`, `pg_trgm`; enums `document_status`, `recipient_role`, `recipient_status`, `event_type`; `set_updated_at()` trigger function |
| `20261003000200_profiles.sql`               | `profiles`; triggers that create a profile on `auth.users` insert and sync email changes                                              |
| `20261003000300_documents.sql`              | `documents` (all §8 columns incl. `deleted_at`), `document_recipients`, `document_user_state`, indexes (incl. trigram)                |
| `20261003000400_document_events.sql`        | Append-only `document_events` (UPDATE/DELETE/TRUNCATE raise); `log_event()` executable only by `service_role`                         |
| `20261003000500_access_helpers.sql`         | `is_document_owner`, `is_draft_owner`, `is_active_participant`, `shares_document_with` (security definer, `search_path = ''`)         |
| `20261003000600_rls_policies.sql`           | RLS on every table; default grants revoked from `anon`/`authenticated`; insert/update allowed only on specific columns                |
| `20261003000700_profiles_view_and_rpcs.sql` | `public_profiles` view; `my_documents()`, `get_dashboard_summary()`, `list_recent_documents()`, `link_recipients_to_user()`           |

## 4. Test results

Final run, from a freshly reset database:

| Check                                       | Result                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| `npm run typecheck`                         | ✅ no errors                                            |
| `npm run lint`                              | ✅ no errors, no warnings                               |
| Prettier                                    | ✅ all files formatted                                  |
| `npm test` (Jest + RNTL)                    | ✅ **129 passed**, 11 suites                            |
| `npm run db:reset`                          | ✅ 7 migrations + seed applied                          |
| `npm run db:test` (pgTAP)                   | ✅ **54 passed**, 4 files                               |
| `npm run test:integration` (local Supabase) | ✅ **10 passed**                                        |
| `expo export --platform all`                | ✅ web, iOS (Hermes) and Android (Hermes) bundles built |
| Web smoke test (Playwright, light + dark)   | ✅ full flow, no unexpected console errors              |

**Mutation check:** I confirmed the pgTAP tests fail when the rules they cover are weakened. Granting
`UPDATE (status)` makes two tests fail, and making `document_events` readable by everyone makes the
pending-participant test fail. While doing this I found the original status test passed for the wrong
reason (the RLS row check also caught it), so I tightened it to assert the column-privilege error
specifically.

**Flake note:** one Jest run (out of about 16) reported one failing test right after a config change.
I couldn't reproduce it in 14 later runs, 8 of them with `--no-cache`, and the output didn't name the
test. If it comes back, it's most likely a `waitFor` timeout under load.

## 5. Acceptance criteria

| #   | Criterion                                                                                                                     | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Typecheck, lint, Jest pass                                                                                                    | ✅     | §4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | `supabase db reset` from scratch                                                                                              | ✅     | §4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | pgTAP covers every listed case                                                                                                | ✅     | `01_documents_rls`: user B can't select, update or delete A's documents and recipients; status, paths, `deleted_at`, owner, recipient status and non-draft inserts are all denied by column privilege. `02_events_rls`: nobody can update or delete events, including the table owner; `authenticated` and `anon` can't call `log_event`. Group activation and CC-before-completion cases in `01`; unverified-email linking in `03`; seed dashboard counts in `04`                                                                                                                                                  |
| 4   | Fresh install → onboarding once → welcome → sign-up → verification link → Home; sign out → welcome; relaunch restores session | ⚠️     | **Verified on the server** by the integration tests: sign-up gives no session; sign-in before verifying returns `email_not_confirmed`; the emailed link redirects to `signflow://auth/callback?flow=signup&code=…`; code exchange gives a confirmed session; the profile is created. Recovery works the same way. **Verified in the web build:** onboarding is shown once, then welcome, sign-in, Home, log out back to welcome, and the session survives a reload. **Not verified** on an iOS/Android device: native deep-link opening and the SecureStore-backed restore. No simulator is available here (see §8) |
| 5   | Apple and Google sign-in wired end-to-end                                                                                     | ⚠️     | Code is complete (`src/features/auth/socialAuth.ts`), and the README has step-by-step setup. **Untested**, because it needs your Apple/Google credentials and a device. The Google button stays hidden until its env vars are set                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | Seed owner sees matching counts and 5 recent docs; seed recipient sees "Needs your signature"                                 | ✅     | Web smoke test and integration tests: owner 1/2/1/1 with 5 recent documents and the right statuses; recipient 1/0/1/1 with _Employment Agreement.pdf_ as "Needs your signature" and _Vendor Agreement.pdf_ (where she's CC) hidden. Screenshot: `phase-1/light-05-home.png`                                                                                                                                                                                                                                                                                                                                         |
| 7   | Light/dark, largest font size, screen-reader labels                                                                           | ⚠️     | ✅ Light and dark mode on every screen (screenshots). ✅ AA contrast enforced by `src/theme/__tests__/contrast.test.ts`. ✅ Roles and labels asserted by RNTL and Playwright role queries; icon-only buttons need a label by type. ⚠️ **Largest Dynamic Type and VoiceOver/TalkBack need a device check.** As a proxy, a 320pt-wide layout wraps without horizontal overflow, and only the avatar initials cap font scaling (1.2×)                                                                                                                                                                                  |
| 8   | No secrets; `.env.example` complete; README complete                                                                          | ✅     | Tracked files scanned for keys (none); `.env` is gitignored; `config.toml` secrets use `env()`. The README covers prerequisites, local Supabase, env, EAS dev builds, tests and type generation                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 6. Stubs and TODOs

Every placeholder is labelled in the UI with "Coming in Phase N".

| Item                                                                                                                                                                           | Target                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Documents tab (shows the bucket filter it was opened with), global search, upload, document details                                                                            | Phase 2                |
| Account → storage usage, profile photo (`avatar_path` column exists)                                                                                                           | Phase 2                |
| Account → saved signature and initials                                                                                                                                         | Phase 3                |
| Account → default signing settings                                                                                                                                             | Phase 5                |
| Activity tab, notifications inbox (bell icon has no unread state yet), notification settings                                                                                   | Phase 7                |
| Account → change password, Face ID / Touch ID, 2FA, sign out of other devices, **delete account**                                                                              | Phase 8                |
| `DOCUMENT_CREATED` / `DOCUMENT_RENAMED` triggers (only `log_event()` exists so far)                                                                                            | Phase 2 (as specified) |
| Audit hash chain (`prev_hash` / `hash` columns exist, unused)                                                                                                                  | SHOULD, later          |
| Language row is static "English" until a second locale exists                                                                                                                  | later                  |
| Placeholders to replace: bundle ID `com.example.signflow`; legal URLs in `src/constants/legal.ts`; app icon and splash (Expo template assets); brand mark on Welcome (an icon) | owner, see §8          |

## 7. Spec issues and decisions

All of these are now recorded in `SPEC.md`.

1. **Active participant** (§14 left this undefined): a linked recipient whose status isn't `pending`, on a
   non-draft document. Server code in Phases 5–7 must move recipient status out of `pending` exactly
   when a group activates. A CC moves at completion.
2. **Co-participant profiles** come through a `public_profiles` view exposing only `id`, `full_name` and
   `avatar_path`. The base `profiles` RLS stays self-only, so phone numbers never leak.
3. **Colour tokens:** light `warning` changed from `#B26B00` to `#9E5F00`, and light `success` from
   `#1F8A4C` to `#1B7D45`. The originals failed AA on `surface` (3.96:1 and 4.12:1).
4. **Onboarding route** is `(onboarding)/onboarding.tsx`, not `index.tsx`, which would clash with the
   root `index` redirect. The onboarding flag is in AsyncStorage, since it isn't sensitive.
5. **No account enumeration:** with confirmation on, Supabase returns success for an already-registered
   email, so sign-up always goes to "Check your email". `USER_EXISTS` copy exists but rarely shows.
6. **Google on iOS** needs `skip_nonce_check` in Supabase, because the native SDK adds a nonce the app
   can't supply. This is a known tradeoff; Apple sign-in does use a nonce.
7. **Account deletion (Phase 8):** `documents.owner_id` has no `ON DELETE` rule, so the retention policy
   (§17.2/§17.3) must be settled before Phase 8.
8. **Phase 2 should build `list_documents` on `my_documents()`**, so bucket logic stays in one place.
   It already excludes hidden documents.

## 8. Environment limits and what I need from you

This container has no iOS simulator or Android emulator. `docs.expo.dev` and `api.expo.dev` are
blocked, so packages were installed with `EXPO_OFFLINE=1`, which uses Expo's bundled version list, and
`expo-doctor` wasn't run. **Please run `npx expo-doctor` locally.**

Before or during Phase 2:

1. **Device check** of criteria 4, 5 and 7 on an EAS dev build (`npx eas-cli build --profile development`).
2. **Bundle ID / Android package** to replace `com.example.signflow`.
3. **Apple and Google credentials** (README → Configuration) to test social sign-in.
4. **Brand assets** (logo, app icon) and final legal URLs (SPEC §22, items 4 and 7).
5. Nothing else blocks Phase 2. Its storage limits and buckets are already defined in SPEC §9.
