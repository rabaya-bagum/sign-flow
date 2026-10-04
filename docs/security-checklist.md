# Security checklist (Phase 8)

This is the review against SPEC §14 and the Phase 8 hardening items, as of 2026-10-04.

- **Status:** ✅ done and tested · ⚠️ done with a known limitation · ⏳ needs the owner or a
  production environment.
- **Evidence** names the test or file that shows it.

The owner signs it off at the end (SPEC §20 done-when). Items marked ⏳ are not something code can
close.

## 1. Authentication and sessions

| #   | Check                                                      | Status | Evidence / notes                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Session stored in secure storage on device                 | ✅     | `src/lib/secureSessionStorage.ts`: AES-encrypted, key in Keychain/Keystore (`expo-secure-store`). Test: `src/lib/__tests__/secureSessionStorage.test.ts`. The web build (guest page, smoke tests) uses `localStorage`.                                                                         |
| 1.2 | Short access-token TTL with refresh rotation               | ✅     | `config.toml`: `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`, reuse interval 10 s. Set the same in the hosted project.                                                                                                                                                           |
| 1.3 | Password rules                                             | ✅     | Min 10 characters, letters and digits (`config.toml` and `shared/auth.ts`). zxcvbn (SHOULD) is not done.                                                                                                                                                                                       |
| 1.4 | Change password requires recent sign-in or an emailed code | ✅     | `secure_password_change = true`. The app asks for the emailed code on `reauthentication_needed`. Tests: `ChangePasswordScreen` Jest and `tests/e2e/security-flow.mjs`.                                                                                                                         |
| 1.5 | Two-factor (TOTP) enforced by the server, not only the app | ✅     | `20261009000200_mfa.sql`: `mfa_satisfied()` plus a restrictive policy on every table and on `storage.objects`; definer helpers check it; `requestContext` refuses aal1 for users with a factor. Tests: pgTAP `12_mfa` (9), Deno `mfa.test.ts`, web E2E.                                        |
| 1.6 | Sign out of other devices                                  | ✅     | `signOut({ scope: 'others' })`. The E2E checks the other device's refresh token is refused.                                                                                                                                                                                                    |
| 1.7 | Biometric unlock                                           | ⚠️     | `expo-local-authentication` gate at launch and after 60 s in the background, with device passcode fallback. It locks the UI only: the session is still on the device (by design, like most apps). It is turned off at sign-out. **Device test pending.**                                       |
| 1.8 | Access tokens end when the session ends                    | ⚠️     | Refresh tokens are revoked at once (sign-out, other devices, deletion). An already-issued access token stays valid until it expires (≤ 1 h), because PostgREST checks only the signature. Edge Functions check the user on every call. Residual risk accepted; shorten `jwt_expiry` if needed. |
| 1.9 | Apple / Google sign-in                                     | ⏳     | Code since P1. Needs production credentials and a device test.                                                                                                                                                                                                                                 |

## 2. Authorization (RLS)

| #   | Check                                                            | Status | Evidence / notes                                                                                                                                    |
| --- | ---------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | RLS on every table, matching SPEC §14                            | ✅     | 15 tables with RLS. pgTAP: 12 files, 226 assertions, including negative cases (another user, recipients changing status, events append-only).       |
| 2.2 | Helpers are `security definer`, `stable`, `search_path = ''`     | ✅     | `20261003000500_access_helpers.sql`. All definer functions set `search_path = ''`.                                                                  |
| 2.3 | Column-level grants on protected columns                         | ✅     | Documents (status, paths, hashes) and profiles (email, `deleted_at`). pgTAP `01`, `03`, `11`.                                                       |
| 2.4 | Service-only functions are not executable by clients             | ✅     | `revoke … from public, anon, authenticated` on every state-changing RPC. pgTAP checks `void_document`, `run_cron_tick`, `delete_account_data`, etc. |
| 2.5 | Storage: private buckets, path-scoped policies, short-lived URLs | ✅     | Clients cannot read `documents` directly. Signed URLs last 300 s (`shared/limits.ts`). pgTAP `05`, Deno `get-download-url`.                         |
| 2.6 | Never trust client status, order or completeness                 | ✅     | Every state change goes through definer RPCs with a document row lock (SF030–SF040). Deno `signing.test.ts`.                                        |

## 3. Signing links and OTP

| #   | Check                                  | Status | Evidence / notes                                                                                                                  |
| --- | -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Tokens are random and stored hashed    | ✅     | 32 random bytes, base64url; SHA-256 at rest (`recipient_access_tokens.token_hash`).                                               |
| 3.2 | Links expire, are revoked and replaced | ✅     | Expiry, void, decline, reminder (new link, old refused), completion → download-only. Deno `lifecycle.test.ts`, `signing.test.ts`. |
| 3.3 | OTP: 6 digits, 10-minute life, limited | ✅     | 5 wrong tries per code, 10 checks per link per 10 min, 1 send/min and 5/h per recipient (`_shared/otp.ts`).                       |

## 4. Rate limits (SPEC §14 review)

All limits are fixed windows in `public.check_rate_limit` (service role only). Every signed-in caller also has an overall ceiling of **300 requests/min across all functions** (`serveJson`).

| Endpoint                                      | Limit                                         | Key              |
| --------------------------------------------- | --------------------------------------------- | ---------------- |
| Auth email resend / password reset            | 1/min (Supabase `max_frequency`)              | email            |
| `send-document`                               | 20/h                                          | user             |
| `remind`                                      | 30/h; and 1 per recipient per 24 h            | user; recipient  |
| `void-document`                               | 20/h (new)                                    | user             |
| `delete-draft`                                | 60/h (new)                                    | user             |
| `delete-account`                              | 5/h (new; also slows password guessing)       | user             |
| `process-upload`                              | as Phase 2 (`RATE_LIMIT`)                     | user             |
| `get-download-url`                            | 60/min per purpose                            | user             |
| `signing-session`, `esign-consent`, `decline` | 120/5 min, 60/h, 20/h (new)                   | user             |
| `submit-signing`, `finalize-document`         | 30/h, 10/h                                    | user             |
| `register-push-token`                         | 30/h                                          | user             |
| All guest endpoints                           | 300/5 min per IP and 120/5 min per token      | IP; token        |
| `guest-otp` send / verify                     | see 3.3                                       | recipient; token |
| `cron-tick`                                   | shared secret (constant-time compare), no JWT | —                |

The per-IP key uses the first `X-Forwarded-For` hop, which on Supabase is set by the gateway. ⏳ Confirm this against the hosted gateway before launch.

## 5. Input, output and logging

| #   | Check                                               | Status | Evidence / notes                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1 | Zod validation on client and in every Edge Function | ✅     | `serveJson` / `serveGuest` parse every body. Shared schemas live in `/shared`.                                                                                                                                                                                                                                                                         |
| 5.2 | Typed error envelope; no internals leaked           | ✅     | `errorResponse`: unexpected errors return `UNKNOWN`. **Fixed in P8:** the server log now keeps only name, message and stack, not the whole error object.                                                                                                                                                                                               |
| 5.3 | No logging of tokens, OTPs or signature images      | ✅     | Reviewed every `console.*` in functions: ids and messages only. The app never logs them. Sentry events are scrubbed (5.5).                                                                                                                                                                                                                             |
| 5.4 | No secrets in the app or repo                       | ✅     | Only `EXPO_PUBLIC_*` values are in the app. Service, Resend, cron and Expo secrets live in function env or Vault. `supabase/functions/.env` is gitignored.                                                                                                                                                                                             |
| 5.5 | Sentry PII scrubbing                                | ✅     | `src/lib/scrub.ts`: emails, JWTs, Bearer tokens, `/s/<token>`, `token=`/`code=`/`otp=` query values, phone numbers and `data:` images are removed. The user is reduced to its id; request headers and bodies are dropped. No screenshots, no view hierarchy, no console breadcrumbs, `sendDefaultPii: false`. Test: `src/lib/__tests__/scrub.test.ts`. |
| 5.6 | CORS                                                | ✅     | `Access-Control-Allow-Origin: *` on functions. Safe because they use bearer tokens, not cookies.                                                                                                                                                                                                                                                       |

## 6. Account deletion (SPEC §17.3)

| #   | Check                                               | Status | Evidence / notes                                                                                                                                                                                                                 |
| --- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | In-app deletion with re-authentication              | ✅     | Password, or a sign-in within the last 10 minutes for social-only accounts; plus 2FA if enrolled. Deno `delete-account.test.ts`, web E2E.                                                                                        |
| 6.2 | Deletes own data, keeps other participants' records | ✅     | Deleted: profile details, signatures, push tokens, notifications, drafts, solo documents and their files. In-progress documents are voided and recipients told. The profile becomes a name-and-email tombstone. pgTAP `11` (14). |
| 6.3 | Signs out everywhere                                | ✅     | Supabase soft delete revokes refresh tokens. The test checks that the old session and the password are refused.                                                                                                                  |
| 6.4 | Retention policy after deletion                     | ⏳     | SPEC §22 Q4: legal review of what the tombstone keeps and for how long.                                                                                                                                                          |

## 7. Supply chain and CI

| #   | Check                                     | Status | Evidence / notes                                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7.1 | Dependency audit in CI                    | ✅     | `npm run audit:deps` fails on any high or critical advisory in production deps not accepted in `security/audit-allowlist.json`. Each accepted entry has a reason and a review-by date. Two are accepted today, both build-time Expo CLI tooling. |
| 7.2 | Edge Function config checked in CI        | ✅     | `npm run check:functions` (a missing `deno.json` made `delete-account` fail to boot; found by E2E).                                                                                                                                              |
| 7.3 | Dev-only code is excluded from production | ✅     | `npm run check:dev-routes`. `dev-stamp` refuses everything unless `DEV_TOOLS` is set and is not in `functions:deploy`.                                                                                                                           |

## 8. Before launch (owner)

- ⏳ Hosted project settings to match `config.toml`:
  - auth: TOTP enroll/verify on, `secure_password_change` on, JWT expiry, refresh-token rotation;
  - email rate limits;
  - storage bucket limits.
- ⏳ Vault secrets `cron_tick_url` / `cron_tick_secret`, and function secrets (README).
- ⏳ Sentry project: confirm data scrubbing is also on server-side ("Data Scrubber" and "Scrub IP addresses").
- ⏳ Penetration test or external review (recommended for an e-signature product).
- ⏳ Legal review: ESIGN disclosure, terms, privacy policy, retention (SPEC §22 Q4).

## Sign-off

| Role              | Name | Date | Signature |
| ----------------- | ---- | ---- | --------- |
| Product owner     |      |      |           |
| Security reviewer |      |      |           |
