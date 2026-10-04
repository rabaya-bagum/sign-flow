# Phase 1 prompt — Foundation

> Paste everything below the line into your coding agent. It assumes `SPEC.md` is in the repo root.

---

You are building **SignFlow**, a cross-platform (iOS + Android) e-signature app. The full product and
technical specification is in **`SPEC.md`** at the repo root. Read it completely before you do anything
else. It is the source of truth. Where this prompt and the spec disagree, follow this prompt for Phase 1
scope and tell me about the conflict.

## Goal of Phase 1
Build a production-quality **foundation**: project setup, design system, navigation, the complete
authentication flow, the core database schema with tested Row Level Security, and a Home dashboard backed
by **real queries** against seeded local data. Later phases build on this, so prioritize correctness and
structure over breadth.

## Working agreement
1. **Plan first, then stop.** Before writing code, reply with:
   - architecture overview (providers, auth/session flow, routing/auth gate, data-access pattern)
   - the file tree you will create
   - the migration plan (tables, enums, functions, policies) for this phase
   - library choices with versions, and anything in the spec you think is wrong or risky

   **Then wait for my approval.**
2. Work in small, logical commits with clear messages.
3. **No silent fakes.** Never present mock or hard-coded data as a working feature. Seed data lives only in
   `supabase/seed.sql`. If something is stubbed, it must be visibly marked in the UI (e.g. "Coming in
   Phase 2") and listed in your final report.
4. Do not build anything from later phases (no upload, PDF viewing, editor, signing, sending, or push).
   If a Phase 1 screen links to later work, show a clearly labelled placeholder.
5. If something in the spec is ambiguous, ask. Don't invent product behavior.

## In scope

### A. Project setup
- Expo (latest stable SDK, record the exact version in the README), TypeScript `strict`, Expo Router.
  **Configure for EAS dev builds.** Expo Go is not a target.
- ESLint + Prettier, path aliases (`@/…`), and the folder structure from SPEC §18 (create only the folders
  you use).
- Scripts: `typecheck`, `lint`, `test`, `db:reset`, `db:test`, `gen:types`.
- Supabase CLI local project (`supabase/`), with generated DB types committed to `src/types/database.ts`.
- `.env.example` with **only** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and the Google
  client IDs. No secret keys in the app.
- `app.config.ts` with the `signflow://` scheme, bundle identifiers as placeholders, and Apple sign-in
  capability.

### B. Design system (SPEC §3)
- Theme tokens (light + dark exactly as in §3.1), spacing, radius, typography, elevation, and a
  `ThemeProvider` with system/light/dark modes persisted to the user's profile (fallback: local storage).
- Components, each with RNTL tests and accessibility props: `Screen` (safe area + keyboard avoidance),
  `AppText`, `AppButton` (primary / secondary / ghost / destructive, loading, disabled), `AppInput`
  (label, error, secure toggle, integrates with RHF), `Card`, `ListRow`, `StatusBadge` (all §3.3
  statuses), `EmptyState`, `LoadingSkeleton`, `ConfirmationModal`, `Avatar`.
- A dev-only `/dev/components` route that renders every component in both themes, for review.
- i18n scaffolding (`i18next`). **All user-facing strings go through `t()`.**

### C. Navigation (SPEC §4)
- Route groups `(onboarding)`, `(auth)`, `(app)/(tabs)` with an auth gate. Splash restores the session and
  redirects. Onboarding is shown once.
- Tabs: Home, Documents, Activity, Account. Documents and Activity are labelled placeholders using
  `EmptyState` (e.g. "Documents arrive in Phase 2").
- Deep-link handling for email verification and password reset.

### D. Authentication (SPEC §5.11)
- Screens: splash, onboarding (3 cards with the spec copy), welcome, sign up, sign in, forgot password,
  verify email (resend with a 60 s cooldown), reset password.
- Email/password, **Sign in with Apple** (`expo-apple-authentication`), and **Google**
  (`@react-native-google-signin/google-signin`), both via `supabase.auth.signInWithIdToken`.
- React Hook Form + Zod. Schemas live in `/shared/auth.ts` and have unit tests. Password ≥ 10 characters.
- Supabase session persisted in secure storage using the encrypted large-value pattern (SecureStore holds
  the key, encrypted session in AsyncStorage). Auto-refresh tied to `AppState`.
- Friendly mapping of auth errors (invalid credentials, email not confirmed, user exists, rate limited).
- After sign-in, call `link_recipients_to_user()` (SPEC §6.4).

### E. Database (SPEC §8, §14). Migrations only.
Create in this phase:
- Extensions: `citext`, `pg_trgm`.
- Enums: `document_status`, `recipient_role`, `recipient_status`, `event_type`.
- Tables: `profiles` (plus a trigger creating it from `auth.users`, keeping `email` in sync),
  `documents`, `document_recipients`, `document_events`, `document_user_state`. Use the exact columns
  from SPEC §8, including the ones later phases will populate.
- Helper functions `is_document_owner(uuid)` and `is_active_participant(uuid)`: `security definer`,
  `stable`, `set search_path = ''`.
- RLS policies for these tables exactly per the SPEC §14 matrix. Add column-level `revoke update` on
  `documents.status`, the path columns, the hash columns, and the timestamps clients must not set.
- `document_events`: append-only (no UPDATE/DELETE policies, plus a trigger that raises on UPDATE/DELETE).
  `log_event(...)` is a security definer function with `execute` revoked from `anon` and `authenticated`.
- `link_recipients_to_user()`: links recipient rows only when the caller's email is **verified**.
- RPCs: `get_dashboard_summary()` returning the four counts per SPEC §6.3, and
  `list_recent_documents(limit int)` returning the display status per §6.3.
- Indexes per SPEC §8 for these tables.
- `supabase/seed.sql`: two users (owner + recipient) and documents covering every bucket, using the
  sample names (Mutual NDA.pdf, Employment Agreement.pdf, Consulting Contract.pdf, Rental Agreement.pdf,
  Insurance Form.pdf). There are no files yet, so leave the paths null.

### F. Home dashboard (SPEC §5.1)
- Header (large title, search / + / notifications). Search, +, and notifications open labelled
  placeholders.
- Summary card with four counts from `get_dashboard_summary()`. Rows navigate to the Documents tab with
  the bucket param (a placeholder screen for now, but it reads and shows the param).
- Recent documents list from `list_recent_documents(5)`, with status icon, title, display status,
  relative date, and an info button (placeholder details route).
- "Upload document" CTA leads to a placeholder.
- TanStack Query with centralized query keys. Skeleton loading, pull-to-refresh, empty state, error state
  with retry.

### G. Account (basic)
- Profile view/edit (name, phone), theme selector, Privacy/Terms/ESIGN disclosure links (placeholder URLs
  in `/constants/legal`), and log out with confirmation.
- Other sections are listed but disabled, labelled with the phase that delivers them.

## Out of scope for Phase 1
File upload, storage buckets, PDF rendering, field editor, signatures, recipients UI, sending, Edge
Functions (except one if you truly need it; justify it in the plan), email beyond Supabase auth emails,
push notifications, biometrics, 2FA, account deletion, the Activity feed, and global search.

## Acceptance criteria. All must be demonstrably true.
1. `npm run typecheck`, `npm run lint`, and `npm test` pass with zero errors.
2. `supabase db reset` applies all migrations and the seed from scratch with no errors.
3. **pgTAP tests (`npm run db:test`) pass and include at least:**
   - user B cannot select, update, or delete user A's documents or recipients
   - an authenticated user cannot update `documents.status` or any protected column, even on their own document
   - nobody (owner included) can update or delete `document_events`, and `authenticated` cannot call `log_event`
   - a linked recipient can select a document whose group is active, and cannot select it while their group is `pending`
   - a CC recipient cannot select the document before it is `completed`
   - `link_recipients_to_user()` does not link when the email is unverified
   - `get_dashboard_summary()` returns the correct counts for both seed users
4. A fresh install shows splash → onboarding (once) → welcome. Email sign-up → verification deep link →
   Home works end-to-end against local Supabase. Sign out returns to welcome. Relaunch restores the session.
5. Apple and Google sign-in are wired end-to-end. If credentials can't be configured in your environment,
   the code is complete, the README documents the exact setup steps, and the report says so.
6. Signed in as the seed owner, Home shows counts that match the seed and five recent documents with the
   correct display status. The seed recipient sees "Needs your signature" for the document whose group is
   active.
7. Every screen works in light and dark mode, at the largest accessibility font size without clipping
   critical content, and with VoiceOver/TalkBack labels on all interactive elements.
8. No secret keys anywhere in the app or repo. `.env.example` is complete. The README covers prerequisites,
   local Supabase, env setup, dev build creation (EAS), running tests, and regenerating types.

## Final phase report (required format)
1. **Summary:** what was built.
2. **File tree** of created/changed files.
3. **Migrations:** list with a one-line purpose each.
4. **Test results:** command output summary for typecheck, lint, Jest, and pgTAP.
5. **Acceptance criteria:** each item marked ✅ / ⚠️ / ❌ with evidence or explanation.
6. **Stubs & TODOs:** every placeholder and its target phase.
7. **Spec issues:** anything in `SPEC.md` you found wrong, ambiguous, or risky, with a proposed fix.
8. **Next:** anything Phase 2 needs from me (accounts, keys, decisions).

Start with step 1 of the working agreement: read `SPEC.md`, then send me your plan and wait.
