# SignFlow — Product & Technical Specification

> Single source of truth for building SignFlow. Implementation prompts reference this file
> (`prompts/phase-N.md`). If code and spec disagree, update the spec deliberately — never drift silently.

**Status:** v1.0 (draft for build) · **Owner:** product owner · **Last updated:** 2026-10-03

---

## 0. How to read this spec

- **Priority tags**
  - **MUST**: required for the MVP release.
  - **SHOULD**: in the MVP if time allows, otherwise the first release after it.
  - **LATER**: designed for, but not built yet.
- **Phase tags** `[P1]`…`[P8]` say which build phase delivers a feature (see §20).
- Anything this spec does not define is an **open question** (§22). Raise it; don't guess.
- "Production-quality" means that **no mock data is presented as a working feature**. Every TODO, stub, or
  unimplemented path must be listed explicitly in the phase report.

---

## 1. Product overview

SignFlow is a cross-platform (iOS + Android) mobile app for preparing, sending, signing, and tracking
electronic signature requests, with a companion **guest web signing page** for recipients who don't have
the app. It is inspired by tools such as DocuSign and Adobe Acrobat Sign, but has **original design and
branding**. No third-party trademarks, icons, layouts, colors, or copyrighted UI assets may be copied.

### 1.1 Core jobs to be done

1. **Sign** a document someone sent me, in the app or via an email link.
2. **Request signatures**: upload a PDF, add recipients, place fields, and send.
3. **Track** every document's status and audit trail.
4. **Receive** a tamper-evident completed PDF plus an audit certificate.

### 1.2 MVP scope summary

| Area          | MUST                                                                   | SHOULD                                 | LATER                                        |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| Auth          | Email/password, email verification, reset, Apple, Google               | Biometric unlock, TOTP 2FA             | Enterprise SSO                               |
| Upload        | PDF from Files, camera scan → PDF, images → PDF                        | —                                      | Cloud drives (Drive, Dropbox, OneDrive, Box) |
| Recipients    | Signer, CC, signing order (sequential + parallel groups)               | Approver, Viewer                       | Templates, bulk send                         |
| Fields        | Signature, Initials, Name, Date signed, Text, Checkbox                 | Email, Radio group, Dropdown           | Stamp, formulas, conditional fields          |
| Signing       | In-app signing, guest web signing, decline                             | Email OTP for "require authentication" | SMS OTP, ID verification                     |
| Output        | Flattened PDF, original preserved, audit certificate, SHA-256 hashes   | Hash-chained audit log                 | PAdES digital signatures                     |
| Notifications | Email for requests/completion, in-app notifications                    | Push, reminders, expiry                | Webhooks                                     |
| Docs library  | List, filter, search, sort, rename, download/share, void, delete draft | Duplicate, grid view                   | Folders, tags                                |
| Account       | Profile, saved signatures, theme, logout, **account deletion**         | Notification prefs, language           | Teams, orgs, branding, plans                 |

---

## 2. Technology stack

| Concern                 | Choice                                                                                                                                              | Notes                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App                     | React Native + **Expo** (latest stable SDK at project start, record the version in README)                                                          | **Dev builds via EAS. Expo Go is not supported** (native modules required)                                                                                                                               |
| Language                | TypeScript, `strict: true`                                                                                                                          | No `any` without a justifying comment                                                                                                                                                                    |
| Navigation              | Expo Router (file-based)                                                                                                                            | Also used for the **web export** of the guest signing page                                                                                                                                               |
| Server state            | TanStack Query                                                                                                                                      | Query keys centralized in `lib/queryKeys.ts`                                                                                                                                                             |
| Client state            | Zustand                                                                                                                                             | UI/session-only state; never cache server data here                                                                                                                                                      |
| Forms                   | React Hook Form + Zod                                                                                                                               | Zod schemas shared between client and Edge Functions where possible (`/shared`)                                                                                                                          |
| Backend                 | Supabase: Postgres, Auth, Storage, Edge Functions (Deno)                                                                                            | Local dev via Supabase CLI; **all schema changes as migrations**                                                                                                                                         |
| Scheduling              | `pg_cron` + `pg_net` → Edge Function                                                                                                                | Reminders, expiry, cleanup                                                                                                                                                                               |
| Email                   | Resend (behind an `EmailProvider` interface); local dev and tests use Mailpit's HTTP API                                                            | Supabase only sends auth emails; transactional email is ours (`_shared/email`; `RESEND_API_KEY` in production, `MAILPIT_API_URL` locally)                                                                |
| Push                    | `expo-notifications` + Expo Push API (called from Edge Functions)                                                                                   |                                                                                                                                                                                                          |
| PDF render (app)        | **One offline pdf.js "surface"** (`web/pdf-surface` → `assets/pdf-surface/surface.html`): `react-native-webview` on native, sandboxed iframe on web | One rendering engine = one coordinate system everywhere (validated by the Phase 3 spike). The surface streams the signed URL itself; documents are never written to disk. Bridge: `/shared/pdfBridge.ts` |
| PDF processing (server) | `pdf-lib` in Edge Functions                                                                                                                         | Page metadata extraction, image→PDF, flattening, certificate generation                                                                                                                                  |
| File picking            | `expo-document-picker`, `expo-image-picker`                                                                                                         |                                                                                                                                                                                                          |
| Resumable uploads       | Built-in TUS 1.0 client (`src/features/upload/resumable.ts`) over `expo/fetch`                                                                      | Above 6 MB. `tus-js-client` was not used: on React Native its Blob path re-reads the whole file for every chunk                                                                                          |
| Document scan           | `react-native-document-scanner-plugin`                                                                                                              | Requires a dev build                                                                                                                                                                                     |
| Signature canvas        | `@shopify/react-native-skia` (CanvasKit wasm on web, loaded lazily)                                                                                 | Transparent PNG export, per-stroke undo; the same renderer produces typed and uploaded signatures                                                                                                        |
| Secure storage          | `expo-secure-store` (with the large-value encrypted-storage pattern for the Supabase session)                                                       |                                                                                                                                                                                                          |
| Biometrics              | `expo-local-authentication`                                                                                                                         | SHOULD                                                                                                                                                                                                   |
| Apple / Google sign-in  | `expo-apple-authentication`, `@react-native-google-signin/google-signin` → `supabase.auth.signInWithIdToken`                                        |                                                                                                                                                                                                          |
| Haptics                 | `expo-haptics`                                                                                                                                      |                                                                                                                                                                                                          |
| i18n                    | `i18next` + `react-i18next`, English only at launch                                                                                                 | All user-facing strings go through `t()` from P1                                                                                                                                                         |
| Crash reporting         | Sentry (`@sentry/react-native`)                                                                                                                     | SHOULD, P8                                                                                                                                                                                               |
| Testing                 | Jest + React Native Testing Library, pgTAP (DB/RLS), Deno test (Edge Functions), Maestro (E2E)                                                      | See §19                                                                                                                                                                                                  |

**Hard rule:** no secret keys in the app bundle. The app only holds the Supabase URL and the **anon key**.
Service-role keys, Resend keys, and similar live only in Edge Function secrets.

---

## 3. Design system

Original branding. A clean, premium, professional look: lots of whitespace, rounded cards, soft borders,
minimal shadows, iOS-level polish that also feels native on Android.

### 3.1 Color tokens

| Token             | Light     | Dark      |
| ----------------- | --------- | --------- |
| `background`      | `#FFFFFF` | `#0E1013` |
| `surface`         | `#F7F8FA` | `#171A1F` |
| `surfaceElevated` | `#FFFFFF` | `#1E2228` |
| `border`          | `#E4E7EC` | `#2C313A` |
| `textPrimary`     | `#1F2328` | `#ECEEF1` |
| `textSecondary`   | `#5B6270` | `#A6ADB8` |
| `textTertiary`    | `#8A919E` | `#757D8A` |
| `primary`         | `#2B59D9` | `#6E93FF` |
| `primaryPressed`  | `#2349B5` | `#8AA8FF` |
| `primarySubtle`   | `#EAF0FD` | `#1C2643` |
| `onPrimary`       | `#FFFFFF` | `#0E1013` |
| `success`         | `#1B7D45` | `#3FBF77` |
| `warning`         | `#9E5F00` | `#E3A23B` |
| `danger`          | `#C93A3A` | `#F06A6A` |
| `fieldHighlight`  | `#FFF4D6` | `#3A3016` |

Text and interactive colors must meet WCAG AA contrast against their background. Verify this in P1.

### 3.2 Scales

- **Spacing:** 4, 8, 12, 16, 20, 24, 32, 40, 48
- **Radius:** `sm` 8, `md` 12, `lg` 16, `xl` 24, `full`
- **Elevation:** `none`, `card` (light: 0 1 2 rgba(16,24,40,0.05); dark: no shadow, use a border), `sheet`
- **Typography** (size/line-height): largeTitle 34/41 bold · title1 28/34 bold · title2 22/28 semibold ·
  title3 20/25 semibold · headline 17/22 semibold · body 17/22 · callout 16/21 · subhead 15/20 ·
  footnote 13/18 · caption 12/16. System font (SF Pro / Roboto). Honor Dynamic Type; cap scaling only where
  layout would break (`maxFontSizeMultiplier` ≥ 1.5).
- **Motion:** 150–250 ms standard transitions; respect the OS "reduce motion" setting.

### 3.3 Status presentation

| Display status       | Badge color                            | Icon idea    |
| -------------------- | -------------------------------------- | ------------ |
| Draft                | neutral (`textSecondary` on `surface`) | pencil       |
| Needs your signature | `warning`                              | pen          |
| Waiting for others   | `primary`                              | clock        |
| Completed            | `success`                              | check-circle |
| Declined             | `danger`                               | x-circle     |
| Voided               | neutral, struck label                  | slash-circle |
| Expired              | neutral                                | hourglass    |

The display status is **derived per viewer** (see §6.3), not stored.

---

## 4. Navigation & routes (Expo Router)

```
app/
  _layout.tsx                 # providers: theme, query client, auth, i18n
  index.tsx                   # splash → redirect by auth state
  (onboarding)/onboarding.tsx # 3 cards, shown once (flag in device storage)
  auth/callback.tsx           # email-link landing: exchanges the PKCE code
  (auth)/
    welcome.tsx
    sign-in.tsx
    sign-up.tsx
    forgot-password.tsx
    verify-email.tsx
    reset-password.tsx        # opened from deep link
  (app)/
    _layout.tsx               # auth gate
    (tabs)/
      _layout.tsx             # Home · Documents · Activity · Account
      home.tsx
      documents.tsx
      activity.tsx
      account/
        index.tsx
        profile.tsx
        signatures.tsx
        security.tsx
        notifications.tsx
        preferences.tsx
    search.tsx                # global search (modal)
    notifications.tsx         # in-app notification inbox
    documents/
      new/                    # creation wizard (stack)
        source.tsx            # pick / scan / images
        details.tsx           # title
        recipients.tsx
        fields.tsx            # editor
        review.tsx            # message, options, send
      [id]/
        index.tsx             # details + activity
        sign.tsx              # signing experience
        view.tsx              # read-only viewer
  (guest)/
    s/[token].tsx             # guest signing page (web export + universal link target)
```

Deep link scheme: `signflow://`. Universal/App Links domain: `sign.<your-domain>` (open question §22).

---

## 5. Screens

### 5.1 Home `[P1 shell, data P2+]` MUST

- **Header:** large title "Home", plus search, new (+), and notifications (with an unread dot) buttons.
- **Summary card:** four rows, each with a count and a chevron, each linking to Documents pre-filtered:
  Needs your signature · Waiting for others · Drafts · Completed. The bucket definitions are in §6.3.
- **Recent documents:** the last 5 the user touched. Each row shows status icon, title, display status,
  relative date, and an info button (→ details).
- **Primary CTA:** "Upload document" (prominent button; FAB on Android is acceptable).
- Pull-to-refresh, skeleton loading, and an empty state.

### 5.2 Documents `[P2]` MUST

- **Segmented filters:** All · Needs signature · Waiting · Drafts · Completed · Voided (Voided also
  includes Declined and Expired, under the label "Closed").
- Search field, sort (newest/oldest/title), and a filter sheet (status via the segments; created and
  modified date ranges as presets: any time, last 7 days, last 30 days, last 12 months; sender from the
  senders of accessible documents; recipient name/email text). Custom date ranges: LATER.
- Grid/list toggle: SHOULD.
- **Card:** title, updated date, participant avatars (max 3 + "+n"), status badge, progress ("2 of 3
  signed"), file size, and a ⋯ menu.
- **⋯ menu:** actions are status-dependent (§6.2). Open · Rename (draft only) · Download/Share ·
  Duplicate (SHOULD) · Void · Delete.
- Swipe actions: SHOULD (left: delete/void where allowed; right: share).
- Infinite scroll (cursor pagination, 20 per page).

### 5.3 Creation wizard `[P2–P5]` MUST

A single linear flow with a step indicator. Users can go back without losing state. Drafts are saved
server-side as soon as step 1's file is uploaded (title defaults to the file name).

1. **Source** `[P2]`: Choose PDF (Files) · Scan document (camera) · Photos → PDF (images converted
   server-side). Validate file type and size before uploading (§15).
2. **Details** `[P2]`: document title (defaults to the file name without its extension).
3. **Recipients** `[P5]`: add rows with name, email, role, and signing order. Reorder with drag handles
   plus accessible up/down buttons. A "Sign in this order" toggle: off means everyone is in group 1
   (parallel). An "Add me" shortcut adds the current user as a signer.
4. **Fields** `[P4]`: the editor (§5.6).
5. **Review & send** `[P5]`: email subject, message, expiration date (default 30 days), reminders
   (§11), require authentication (SHOULD, email OTP), allow signers to decline (default on).
   Buttons: Save draft · Send. Sending is blocked until every signer has at least one signature field
   and every required field is assigned. The rules live in `/shared/send.ts` (the Review step lists
   them; `send-document` enforces them and `send_document()` re-checks inside the transaction):
   a file, ≥ 1 signer, every recipient has a valid unique email, every signer has a signature field,
   only signers have fields. "Sign in this order" gives each acting recipient its own group; a CC
   shares the previous group (CCs are notified at completion).

### 5.4 Document details `[P2 basic, P5–P7 full]` MUST

- Title, plus a status banner (display status + one-line explanation, e.g. "Waiting for Aaliyah
  Fatimah").
- **Info:** pages, file size, created, last updated, sender.
- **Recipients:** name ("(You)" when applicable), email, role, order, recipient status, and the time of
  their last action.
- **Activity:** the per-document audit timeline (§12).
- **Actions** (status-dependent, §6.2): Sign (if it's your turn) · Remind · Edit recipients (SHOULD) ·
  Download (original / completed / certificate) · Share · Void · Delete.
- **Preview** `[P3]`: a static render of page 1 that opens the **viewer** (`documents/[id]/view`):
  continuous scroll with virtualized pages, pinch / double-tap / button zoom (fit-width to 4×), page
  indicator and page-jump sheet, Share. Each page is announced "Page n of N"; screen-reader users can
  open the file in another app through Share. The viewer streams the PDF from a short-lived signed URL
  (`purpose: 'view'`) and keeps no on-disk cache, so there is nothing to clear at logout.

### 5.5 Signing experience `[P6]` MUST

- PDF pages scroll vertically; the user can pinch-zoom and jump to a page.
- The recipient's fields are highlighted (`fieldHighlight`) and other recipients' fields are hidden.
  Fields completed by earlier recipients are shown as rendered values.
- A progress pill ("1 of 4 required") and a **Next field** button that scrolls to and focuses the next
  incomplete required field.
- Tapping a signature or initials field opens the signature sheet (§5.7). Name, email, and date are
  prefilled and confirmed with a tap.
- An **ESIGN consent** step runs before the first interaction (§17.1).
- **Finish** is enabled when all required fields are filled. A confirmation sheet follows, then
  `submit-signing`.
- ⋯ menu: Decline (with a required reason, if allowed), View details, Download original.

### 5.6 Field editor `[P4]` MUST

- **Top bar:** Back · title · Save · Next.
- Vertical pages, zoom, page thumbnails/jump.
- **Bottom toolbar:** field types per the §1.2 priority tags.
- **Interaction:** tap a tool, then tap the page to place the field. Drag to move, use corner handles to
  resize, snap to page bounds, and enforce a minimum size per type.
- **Recipient selector:** a chip at the top. Fields are color-coded per recipient (a palette of 8
  distinguishable colors, consistent in light and dark).
- **Properties sheet:** recipient, required, font size (text-like fields), alignment, default value,
  placeholder, validation (text: none/email/number/regex — SHOULD), options (radio/dropdown).
- Undo/redo: SHOULD (built in P4).
- Autosave (debounced, 800 ms) to `document_fields` through `save_document_fields(document, fields[])`,
  which replaces the field set in one transaction. The status reads "Saving…" from the first unsaved
  change; web warns before unloading with unsaved changes.
- Accessibility: fields are buttons inside the surface; the properties sheet has move/resize buttons,
  and "Place in the middle of page n" places the active tool without a precise tap.
- Placeholder recipients `[P4]`: a draft may have recipients without an email ("Signer 2");
  `document_recipients.email` is nullable and sending (P5) requires every recipient to have one.

### 5.7 Signature creation `[P3]` MUST

- Tabs: **Draw** (canvas, Clear, Undo, Save) · **Type** (name with 3 script-style fonts that are
  bundled and licensed for embedding) · **Upload** (image; background removed by threshold, cropped).
- Signature and initials are handled separately.
- "Save for future use" checkbox, on by default only for the first one of a kind. At most **5 saved per
  kind** (server-enforced). Saved signatures are managed in Account → Signatures; when any exist, the
  sheet opens on "Use saved".
- Output for every method: transparent PNG trimmed to the ink plus 4% padding, long edge 600–1200 px,
  ≤ 500 KB (scaled down further if needed). Draw rejects trivial input; Upload removes the background
  with an adjustable threshold. Unsaved signatures live only in the app cache (cleared at sign-out).
- The output is a transparent PNG. When applied to a document, the image is **copied** into the
  document's storage path, so deleting a saved signature later never changes a signed document.

### 5.8 Activity tab `[P7]` MUST

- Global, reverse-chronological feed of events across all documents the user can access.
- Each row shows event icon, description, actor, document title, and timestamp. Tapping a row opens the
  document.
- Filter by event type: SHOULD.

### 5.9 Global search `[P2]` MUST

- Searches document titles, recipient names, and recipient emails within documents the user can access.
- Debounced (300 ms). Implemented with a Postgres RPC using `ILIKE` + `pg_trgm` index (full-text search
  LATER). Results are grouped by document.

### 5.10 Account `[P1 basic, P3/P7/P8 full]`

- **Profile** `[P1]`: name, email (read-only, change via a verified flow LATER), photo `[P2]`, phone.
- **Signatures** `[P3]`: saved signatures and initials (up to 5 each). Add, set default, delete. Empty
  state: "Save a signature to sign faster."
- **Security** `[P8]`: change password, biometric unlock (SHOULD), 2FA TOTP (SHOULD), "Sign out of all
  other devices" (`signOut({ scope: 'others' })`). A full active-sessions list is LATER (no first-class
  client API).
- **Notifications** `[P7]`: toggles for signature requests, completed documents, reminders. Channel
  toggles for email and push.
- **Preferences:** theme (system/light/dark) `[P1]`, language (English only, picker hidden until a second
  locale exists), default signing settings (default expiry, default reminders) `[P5]`.
- **Storage** `[P2]`: used bytes and document count. Quota display is LATER.
- **Legal:** Privacy policy, Terms, ESIGN disclosure links `[P1]`.
- **Delete account** `[P8]` MUST (App Store requirement, see §17.3).
- **Log out** `[P1]`.

### 5.11 Auth & onboarding `[P1]` MUST

- **Splash:** brand mark, restore session, then redirect.
- **Onboarding** (first launch only), 3 cards:
  1. "Sign documents anywhere": Upload documents and add your signature securely.
  2. "Request signatures": Send documents to one or multiple people.
  3. "Track every document": See when documents are viewed, signed and completed.
- **Welcome:** Continue with Apple (iOS; also on Android if configured) · Continue with Google ·
  Sign up with email · Sign in.
- **Sign up:** full name, email, password (min 10 chars, zxcvbn score ≥ 3 SHOULD), accept Terms/Privacy.
- **Verify email:** instructions, resend (rate-limited, with a 60 s cooldown), and deep-link handling.
- **Forgot / reset password:** email entry, deep link to `reset-password`, new password + confirm.

### 5.12 Guest signing page `[P6]` MUST

- Route `(guest)/s/[token]`, built with Expo Router's web export and hosted on the signing domain.
  The same URL is a universal/App Link, so it opens the app if installed.
- Flow: token check → (optional email OTP) → ESIGN consent → signing UI (shared components with §5.5,
  web-specific PDF canvas) → completion screen with "Download a copy" and "Get the SignFlow app".
- Every guest data access goes through Edge Functions that validate the token. Guests never receive a
  Supabase user session.

---

## 6. Domain rules

### 6.1 Roles

| Role                  | Gets fields?                      | Must act?                         | When notified                                             | Can see document |
| --------------------- | --------------------------------- | --------------------------------- | --------------------------------------------------------- | ---------------- |
| **Signer**            | Yes (≥1 signature field required) | Fill required fields, then Finish | When their order group activates                          | From activation  |
| **Approver** (SHOULD) | No                                | Approve or Decline                | When their order group activates                          | From activation  |
| **Viewer** (SHOULD)   | No                                | No                                | When their order group activates (view-only link)         | From activation  |
| **CC**                | No                                | No                                | Only at completion (receives the final PDF + certificate) | After completion |

### 6.2 Document state machine

**Document status** (stored): `draft` → `in_progress` → `completed` | `declined` | `expired` | `voided`

| From          | Event                          | To            | Who / where                            |
| ------------- | ------------------------------ | ------------- | -------------------------------------- |
| —             | create                         | `draft`       | owner (client insert, RLS)             |
| `draft`       | send                           | `in_progress` | owner → `send-document` Edge Function  |
| `in_progress` | last signer/approver completes | `completed`   | `submit-signing` → `finalize-document` |
| `in_progress` | a signer/approver declines     | `declined`    | `decline` Edge Function                |
| `in_progress` | `expires_at` passes            | `expired`     | cron                                   |
| `in_progress` | owner voids (reason required)  | `voided`      | `void-document` Edge Function          |

`completed`, `declined`, `expired`, and `voided` are **terminal**. The client can never update
`documents.status` directly: RLS and column privileges forbid it.

**Allowed actions by status (owner):**

| Action                           | draft                                        | in_progress                                          | completed            | declined/expired/voided                                 |
| -------------------------------- | -------------------------------------------- | ---------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| Edit title/fields/recipients     | ✅                                           | ❌ (SHOULD: edit an un-acted recipient's name/email) | ❌                   | ❌                                                      |
| Send                             | ✅                                           | —                                                    | —                    | —                                                       |
| Remind                           | —                                            | ✅ (rate-limited: 1 per recipient per 24 h)          | —                    | —                                                       |
| Void                             | —                                            | ✅                                                   | ❌                   | ❌                                                      |
| Duplicate (SHOULD)               | ✅                                           | ✅                                                   | ✅                   | ✅ (creates a new draft from the original PDF + fields) |
| Download original                | ✅                                           | ✅                                                   | ✅                   | ✅                                                      |
| Download completed + certificate | —                                            | —                                                    | ✅                   | —                                                       |
| Delete                           | ✅ soft delete (`deleted_at`), files removed | ❌ (void first)                                      | Hide from my library | Hide from my library                                    |

**Deleting a draft** is done through the `delete-draft` Edge Function: it sets `documents.deleted_at`, removes its storage objects immediately, and logs `DOCUMENT_DELETED`. Soft-deleted rows are excluded by RLS and every RPC. The row is kept so the append-only audit log never dangles.
**"Delete" after sending only hides the document for that user** (`document_user_state.hidden_at`).
Recipients keep their access. Records are retained per §17.2.

**Recipient status:** `pending` (order group not active) → `sent` → `viewed` → `signed` | `approved` |
`declined`. CC: `pending` → `sent` at completion. When a document goes `voided` or `expired`, recipients
who haven't acted stay as they are and the document status explains why.

**Signing order:** recipients with the same `signing_order` act **in parallel**. Group _n+1_ activates
only when every signer/approver in group _n_ has completed. `documents.current_signing_order` tracks the
active group. Viewers in a group don't block it.

### 6.3 Per-viewer display buckets (derived, never stored)

For the current user _U_:

- **Needs your signature:** document `in_progress`, _U_ is a signer/approver recipient
  (`user_id = U`) with status `sent|viewed`, and their `signing_order = current_signing_order`.
- **Waiting for others:** document `in_progress`, _U_ is the owner or has already completed, and _U_ has
  no pending action.
- **Drafts:** owner = _U_, status `draft`.
- **Completed:** status `completed`, _U_ is the owner or a participant.
- **Closed:** `declined|expired|voided`.

Implement these as a single SQL function `get_dashboard_summary()` plus a `list_documents(bucket, …)`
RPC so the client logic stays thin and the definitions live in one place.

### 6.4 Linking recipients to accounts

Recipients are invited by email. When a user with a **verified** email signs in, a security-definer
function links any `document_recipients` rows with a matching email (case-insensitive) and
`user_id IS NULL` to that user. `send_document()` also links recipients who already have a verified
account at send time. RLS then grants in-app access. Until then they sign through the guest link.

---

## 7. External signer access (tokens)

- On activation, `send-document` creates one **random 256-bit token** per recipient, stores only its
  **SHA-256 hash** in `recipient_access_tokens`, and emails the link `https://sign.<domain>/s/<token>`.
- Completion emails attach both PDFs (up to 15 MB together) and link to them: people with an account open
  the app; guests get a `purpose = 'download'` token valid for 30 days that only downloads the files.
- Tokens expire when the document reaches a terminal state, when the document expires, or after
  `expires_at`. Re-sending a reminder or editing a recipient's email **revokes** the old token and
  issues a new one.
- **Require authentication (SHOULD):** before showing the document, the guest requests a 6-digit email
  OTP (hashed, 10-minute TTL, max 5 attempts, rate-limited).
- Guest Edge Functions: `guest-open` (validate, log `DOCUMENT_VIEWED`, return the document plus the
  recipient's fields and short-lived signed page URLs), `guest-submit`, `guest-decline`,
  `guest-download`. All of them validate the token on every call.
- Error states: invalid link, expired link, document voided/declined/completed ("already signed"),
  not your turn yet.

---

## 8. Data model

Postgres in schema `public`. Every table has RLS **enabled**. Timestamps are `timestamptz` (UTC). IDs are
`uuid default gen_random_uuid()` unless noted. The DDL below is a sketch; the migrations are the
source of truth.

```sql
-- Enums
create type document_status   as enum ('draft','in_progress','completed','declined','expired','voided');
create type recipient_role    as enum ('signer','approver','viewer','cc');
create type recipient_status  as enum ('pending','sent','viewed','signed','approved','declined');
create type field_type        as enum ('signature','initials','full_name','email','date_signed',
                                       'text','checkbox','radio','dropdown','stamp');
create type signature_kind    as enum ('signature','initials');
create type signature_method  as enum ('drawn','typed','uploaded');
create type event_type        as enum (
  'DOCUMENT_CREATED','DOCUMENT_UPLOADED','DOCUMENT_RENAMED','DOCUMENT_SENT','RECIPIENT_NOTIFIED',
  'DOCUMENT_VIEWED','ESIGN_CONSENT_ACCEPTED','OTP_VERIFIED','FIELDS_COMPLETED','DOCUMENT_SIGNED',
  'DOCUMENT_APPROVED','DOCUMENT_DECLINED','REMINDER_SENT','RECIPIENT_UPDATED','DOCUMENT_COMPLETED',
  'DOCUMENT_DOWNLOADED','DOCUMENT_VOIDED','DOCUMENT_EXPIRED','DOCUMENT_DELETED');

-- Profiles (1:1 with auth.users; created by trigger on auth.users insert)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,                 -- mirrored from auth.users, kept in sync by trigger
  phone text,
  avatar_path text,                    -- storage path, not URL
  theme text not null default 'system' check (theme in ('system','light','dark')),
  locale text not null default 'en',
  notification_prefs jsonb not null default '{}'::jsonb, -- {email, push, topics:{requests,reminders,completed,activity}}; /shared/notifications.ts
  default_expiry_days int not null default 30,
  default_reminder jsonb not null default '{"first_after_days":3,"repeat_every_days":3}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  title text not null check (length(title) between 1 and 200),
  status document_status not null default 'draft',
  original_path text,                  -- storage: documents/{owner}/{id}/original.pdf
  completed_path text,                 -- storage: documents/{owner}/{id}/completed.pdf
  certificate_path text,               -- storage: documents/{owner}/{id}/certificate.pdf
  original_sha256 text,
  completed_sha256 text,
  file_size_bytes bigint,
  page_count int,
  current_signing_order int,
  email_subject text,
  email_message text check (length(email_message) <= 2000),
  expires_at timestamptz,
  reminder_first_after_days int,       -- null = reminders off
  reminder_repeat_every_days int,
  require_email_otp boolean not null default false,
  allow_decline boolean not null default true,
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  deleted_at timestamptz,             -- drafts only; soft delete (§6.2)
  expiry_warned_at timestamptz,       -- "expires tomorrow" sent (§11)
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_pages (
  document_id uuid references documents(id) on delete cascade,
  page_number int not null,            -- 1-based
  width_pt numeric not null,           -- visible box (CropBox ∩ MediaBox) as displayed, after /Rotate
  height_pt numeric not null,
  box_x_pt numeric not null default 0, -- lower-left of the visible box in PDF user space (unrotated);
  box_y_pt numeric not null default 0, --   non-zero for offset MediaBox/CropBox
  rotation int not null default 0 check (rotation in (0,90,180,270)),
  primary key (document_id, page_number)
);

create table document_recipients (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid references profiles(id),  -- linked when an account with this verified email exists
  name text not null,
  email citext,                        -- null only for a draft's placeholder recipient (P4)
  role recipient_role not null default 'signer',
  signing_order int not null default 1 check (signing_order >= 1),
  status recipient_status not null default 'pending',
  sent_at timestamptz, viewed_at timestamptz, completed_at timestamptz,
  declined_at timestamptz, decline_reason text,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, email)
);

create table document_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  recipient_id uuid not null references document_recipients(id) on delete cascade,
  page_number int not null,
  type field_type not null,
  -- Normalized geometry: fractions (0..1) of the displayed page, origin TOP-LEFT.
  x numeric not null check (x >= 0 and x <= 1),
  y numeric not null check (y >= 0 and y <= 1),
  width numeric not null check (width > 0 and x + width <= 1),
  height numeric not null check (height > 0 and y + height <= 1),
  required boolean not null default true,
  properties jsonb not null default '{}'::jsonb,  -- validated by shared Zod schema per type
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Values are separate from definitions: written only by submit-signing, immutable afterwards.
create table field_values (
  field_id uuid primary key references document_fields(id) on delete cascade,
  document_id uuid not null references documents(id),  -- denormalized: its RLS never reads document_fields
  recipient_id uuid not null references document_recipients(id),
  value text,                          -- text/checkbox/radio/dropdown/date
  asset_path text,                     -- signature/initials PNG copied into the document's folder
  filled_at timestamptz not null default now()
);

create table saved_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind signature_kind not null,
  method signature_method not null,
  storage_path text not null,          -- signatures/{user}/{id}.png
  typed_text text, font_key text,
  is_default boolean not null default false,  -- first of a kind; changed via set_default_signature()
  created_at timestamptz not null default now()
);
-- One default per (user_id, kind) (partial unique index); max 5 per kind (insert trigger, SQLSTATE
-- SF001); deleting the default promotes the newest. Clients insert and delete only; no updates.

create table recipient_access_tokens (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references document_recipients(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'sign', -- 'sign' (signing link) | 'download' (completion email, 30 days)
  expires_at timestamptz not null,
  revoked_at timestamptz,
  otp_verified_at timestamptz,         -- this link passed the email code (require_email_otp)
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table recipient_otps (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references document_recipients(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table esign_consents (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references document_recipients(id),
  user_id uuid references profiles(id),
  disclosure_version text not null,
  accepted_at timestamptz not null default now(),
  ip inet, user_agent text
);

-- Append-only audit log. No UPDATE/DELETE for anyone; INSERT only via log_event() / service role.
create table document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id),
  type event_type not null,
  actor_user_id uuid references profiles(id),
  actor_recipient_id uuid references document_recipients(id),
  actor_name text, actor_email text,
  description text not null,
  ip inet, user_agent text,            -- captured server-side from request headers
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text, hash text,           -- SHOULD: hash chain per document
  created_at timestamptz not null default now()
);

create table document_user_state (       -- per-user library state (hide, last opened)
  document_id uuid references documents(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  hidden_at timestamptz,
  last_opened_at timestamptz,
  primary key (document_id, user_id)
);

create table notifications (             -- in-app inbox
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  type text not null,
  title text not null, body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now()
);

create table rate_limits (               -- simple fixed-window limiter for Edge Functions
  key text primary key, window_start timestamptz not null, count int not null
);
```

**Indexes (minimum):** `documents(owner_id, status, updated_at desc)`;
`document_recipients(user_id)`; `document_recipients(email)`; `document_recipients(document_id, signing_order)`;
`document_fields(document_id, recipient_id)`; `document_events(document_id, created_at)`;
`notifications(user_id, read_at, created_at desc)`; trigram indexes on `documents.title`,
`document_recipients.name`, and `document_recipients.email`.

**Field `properties` (Zod, `/shared/fields.ts`):**

- `text`: `{ fontSize, align, placeholder?, defaultValue?, validation?: 'none'|'email'|'number'|{regex}, maxLength? }`
- `checkbox`: `{ defaultChecked? }`
- `radio`: `{ groupId, optionValue }`
- `dropdown`: `{ options: string[], defaultValue? }`
- `date_signed`: `{ format: 'MMM d, yyyy' | 'yyyy-MM-dd' | 'dd/MM/yyyy' }`
- `full_name` / `email`: `{ fontSize, align }`

### 8.1 Coordinate contract (critical)

1. The server extracts each page's **visible box** (CropBox intersected with MediaBox, which is what
   pdf.js renders), its origin (`box_x_pt`, `box_y_pt`), and its rotation into `document_pages` at upload.
   `width_pt`/`height_pt` are the displayed dimensions after rotation.
2. The client renders a page at any zoom, and maps tap/drag positions to fractions of the rendered page
   box (top-left origin, as displayed).
3. One shared, pure function in `/shared/geometry.ts` converts a displayed fractional rect to an
   unrotated PDF user-space rect: undo the displayed rotation, scale by the unrotated box size, flip Y,
   and add the box origin. App, web, and Edge Functions all import it. Nobody re-implements it.
4. **Golden tests:** a fixture PDF set (portrait, landscape, rotation 90/180/270, mixed sizes, offset
   CropBox, non-zero MediaBox origin) must round-trip field positions within ±1 pt. The reference is
   pdf.js's own `viewport.convertToPdfPoint` (§19).

---

## 9. Storage

| Bucket        | Public | Path                                                                                                                 | Who can read                                            | Who can write                                                                                                                            |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `documents`   | No     | `{owner_id}/{document_id}/original.pdf`, `completed.pdf`, `certificate.pdf`, `signing/{recipient_id}/{field_id}.png` | Via Edge Function-issued signed URLs only (TTL ≤ 5 min) | Owner may upload `original.pdf` while the document is `draft`; everything else is service role                                           |
| `uploads-tmp` | No     | `{user_id}/{uuid}.{ext}`                                                                                             | Owner                                                   | Owner (images/scans awaiting conversion; `process-upload` deletes them; a 24 h sweep for abandoned files arrives with `cron-tick` in P7) |
| `signatures`  | No     | `{user_id}/{id}.png` (PNG, ≤ 1 MB)                                                                                   | Owner                                                   | Owner                                                                                                                                    |
| `avatars`     | No     | `{user_id}/avatar.jpg`                                                                                               | Authenticated users (signed URL)                        | Owner                                                                                                                                    |

Storage RLS policies use `storage.foldername(name)[1] = auth.uid()::text`. Downloads always go through
`get-download-url`, which authorizes the request, logs `DOCUMENT_DOWNLOADED`, and returns a short-lived
signed URL. Store paths, never URLs, in the database.

**Limits:** PDF ≤ 25 MB and ≤ 200 pages. Images ≤ 10 MB each, ≤ 30 per conversion, JPEG/PNG/HEIC
(HEIC converted to JPEG on device). Encrypted/password-protected PDFs are rejected with a clear message.

---

## 10. Edge Functions (server logic)

All functions: Zod-validated input, a typed error envelope `{ error: { code, message } }`, rate limiting
where noted, and audit logging through a shared `logEvent()` that captures IP and user agent from headers.

| Function                                                                                           | Caller                 | Purpose                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process-upload`                                                                                   | owner                  | Validate PDF (type, size, not encrypted), compute SHA-256, extract `document_pages`, set `page_count`/`file_size_bytes`; or convert images from `uploads-tmp` → PDF. Logs `DOCUMENT_UPLOADED`. Errors: not a PDF or encrypted → `FILE_UNSUPPORTED`; unreadable → `PDF_RENDER_FAILED`; over 25 MB or 200 pages → `FILE_TOO_LARGE`; file missing → `UPLOAD_FAILED`. Idempotent |
| `send-document`                                                                                    | owner                  | Validate draft completeness, set `in_progress`, activate group 1, issue tokens, send emails/push. Logs `DOCUMENT_SENT`, `RECIPIENT_NOTIFIED`                                                                                                                                                                                                                                 |
| `submit-signing`                                                                                   | auth recipient         | Validate turn and required fields; copy signature PNGs; write `field_values`; set recipient `signed`/`approved`; advance group or call finalize. **Single transaction.**                                                                                                                                                                                                     |
| `signing-session` / `esign-consent`                                                                | auth recipient         | Open the signing screen (state, signed page URL, own fields, earlier values; marks `viewed`); record ESIGN consent                                                                                                                                                                                                                                                           |
| `guest-open` / `guest-consent` / `guest-submit` / `guest-decline` / `guest-download` / `guest-otp` | guest token            | Guest equivalents (§7). Rate-limited per token and IP                                                                                                                                                                                                                                                                                                                        |
| `decline`                                                                                          | auth recipient         | Decline with reason → document `declined`, notify owner + participants                                                                                                                                                                                                                                                                                                       |
| `void-document`                                                                                    | owner                  | Void with reason, revoke tokens; email active and finished recipients, in-app notice for account holders                                                                                                                                                                                                                                                                     |
| `remind`                                                                                           | owner                  | Re-send the request with a new link (old links stop working) to one or all active, un-acted recipients; once per recipient per 24 h (`claim_manual_reminder`)                                                                                                                                                                                                                |
| `finalize-document`                                                                                | internal (owner retry) | Flatten values into a copy of the original (`pdf-lib`), generate the certificate, hash, store, set `completed`, email the final PDF + certificate to all participants including CC. Runs inside the last `submit-signing`; the owner can retry it if that step failed                                                                                                        |
| `get-download-url`                                                                                 | auth participant       | Authorize, log, and return a signed URL. `purpose: 'view' \| 'download'` logs `DOCUMENT_VIEWED` (de-duplicated: one per user per document per 30 min; never changes recipient status) or `DOCUMENT_DOWNLOADED`                                                                                                                                                               |
| `delete-draft`                                                                                     | owner                  | Soft-delete a draft, remove its storage objects, log `DOCUMENT_DELETED`                                                                                                                                                                                                                                                                                                      |
| `cron-tick`                                                                                        | `pg_cron` every 15 min | Expire overdue documents; "expires tomorrow" emails; due reminders; retry stalled finalizations; clean up `uploads-tmp`. Each step claims rows atomically. Called with a shared secret (`x-cron-secret`, Vault `cron_tick_url`/`cron_tick_secret`), not a JWT                                                                                                                |
| `register-push-token`                                                                              | auth                   | Upsert the device's Expo push token for the caller (moves it if the device changed accounts); clients may delete their own tokens                                                                                                                                                                                                                                            |
| `delete-account`                                                                                   | auth                   | §17.3                                                                                                                                                                                                                                                                                                                                                                        |

Postgres RPCs (security invoker unless noted): `get_dashboard_summary()`, `list_documents(...)`,
`search_documents(q)`, `get_document(id)` (works for hidden documents), `get_storage_usage()`,
`list_document_senders()`, `list_activity(before_created_at, before_id, limit, types[])`, `link_recipients_to_user()` (security definer, called after
sign-in), `log_event(...)` (security definer, **execute revoked from `anon` and `authenticated`**).
Display status is computed in one place, `document_display_status(...)`, used by `my_documents()` and
`get_document()`. Service-role only: `check_rate_limit(...)`, `finalize_original_upload(...)`.
Signed download URLs carry a `download=<file name>` parameter appended by the function and encoded once
(the storage client's own option double-encodes characters such as parentheses).

---

## 11. Reminders & expiry `[P7]`

- Per document: `reminder_first_after_days` (null = off) and `reminder_repeat_every_days`. Defaults come
  from the profile.
- `cron-tick` sends a reminder to an active, un-acted recipient when
  `now ≥ coalesce(last_reminded_at, sent_at) + interval`. Reminders stop at any terminal status.
- Manual "Remind" is limited to once per recipient per 24 h.
- Expiry: `cron-tick` sets `expired`, revokes tokens, logs `DOCUMENT_EXPIRED`, and notifies the owner.
  Recipients get an email 24 h before expiry (SHOULD).

---

## 12. Audit trail & certificate

### 12.1 Audit rules

- Every state change and every access to document content creates an event. Events are written **only
  server-side** (Edge Functions, or DB triggers via `log_event`).
- Captured on every event: type, timestamp (server clock), actor (user id and/or recipient id), actor
  name and email, document id, IP and user agent (from request headers; `null` for system events), and
  metadata.
- The log is append-only: no update/delete policies, and a trigger that raises on UPDATE/DELETE.
- SHOULD: hash chain, `hash = sha256(prev_hash || canonical_json(event))`, verified when the certificate
  is generated.

### 12.2 Certificate (PDF, a separate file; appending it as final pages is LATER: the completed hash must stay the hash of the signed document)

Document ID · title · page count · original SHA-256 · completed SHA-256 · sender (name, email) · each
recipient (name, email, role, order, status, sent/viewed/signed timestamps, IP, user agent,
authentication method: link / link + OTP / account) · ESIGN consent timestamp and disclosure version per
signer · completion timestamp · full event history (UTC, with the time zone stated).

---

## 13. Notifications

| Trigger                               | Owner        | Recipient                     | CC  | Channels                                               |
| ------------------------------------- | ------------ | ----------------------------- | --- | ------------------------------------------------------ |
| Group activated / signature requested | —            | ✅                            | —   | email (always), push + in-app if linked account        |
| Recipient viewed                      | ✅           | —                             | —   | in-app, push (pref)                                    |
| Recipient signed/approved             | ✅           | —                             | —   | in-app, push, email (pref)                             |
| Declined                              | ✅           | other active recipients       | —   | email, push, in-app                                    |
| Completed                             | ✅           | ✅                            | ✅  | email with final PDF + certificate links, push, in-app |
| Voided                                | —            | active + completed recipients | —   | email, in-app                                          |
| Reminder                              | —            | ✅                            | —   | email, push                                            |
| Expiring in 24 h (SHOULD) / Expired   | ✅ (expired) | ✅ (expiring)                 | —   | email, in-app                                          |

Every notice for an account holder is written to the in-app inbox. Email and push respect
`profiles.notification_prefs` (channel switches plus topics: requests, reminders, completed/closed,
activity). Signature-request, reminder and completion emails to people signing by link, and void emails
to recipients, are always sent. Signature-request emails to guests can't be disabled, because
they are the product. Email templates are plain, accessible HTML with a text alternative, carrying the
SignFlow brand only.

---

## 14. Security

- HTTPS only. Supabase session stored in secure storage. Short access-token TTL with refresh.
- **RLS on every table.** Policy summary:

| Table                            | SELECT                                                                                 | INSERT                     | UPDATE                                                                                                            | DELETE                  |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| profiles                         | self; co-participants' `id`, `full_name`, `avatar_path` via the `public_profiles` view | trigger                    | self (not `email`)                                                                                                | via `delete-account`    |
| documents                        | owner, or linked recipient whose group is active/past (CC: after completion)           | owner, `status='draft'`    | owner while `draft`, limited columns (title, email fields, options) — never `status`, paths, hashes, `deleted_at` | ❌ (via `delete-draft`) |
| document_pages                   | as documents                                                                           | service role               | —                                                                                                                 | —                       |
| document_recipients              | owner; linked recipient sees all rows of the document (names/emails/status)            | owner while draft          | owner while draft                                                                                                 | owner while draft       |
| document_fields                  | owner; linked recipient sees **own fields** + others' fields that have values          | owner while draft          | owner while draft                                                                                                 | owner while draft       |
| field_values                     | owner; participants after their group is active                                        | service role               | —                                                                                                                 | —                       |
| saved_signatures                 | self                                                                                   | self                       | self                                                                                                              | self                    |
| document_events                  | owner; participants (of that document)                                                 | service role / `log_event` | ❌                                                                                                                | ❌                      |
| notifications                    | self                                                                                   | service role               | self (`read_at` only)                                                                                             | self                    |
| push_tokens                      | self                                                                                   | self                       | self                                                                                                              | self                    |
| tokens/otps/consents/rate_limits | ❌ (service role only)                                                                 | ❌                         | ❌                                                                                                                | ❌                      |

- Implement helper functions `is_document_owner(doc)` and `is_active_participant(doc)` as
  `security definer`, `stable`, with `set search_path = ''`.
- **Active participant** = a recipient row linked to the caller (`user_id = auth.uid()`) whose status is
  not `pending`, on a non-draft, non-deleted document. Status leaves `pending` when the recipient's
  signing group activates (CC: at completion), so this one rule covers active/past groups,
  CC-after-completion and terminal states. Server code must keep recipient status in step with this.
- `public_profiles` is a view that runs with the owner's rights and returns only the caller and people
  who share an accessible document with them, never phone numbers or preferences.
- Column-level `revoke update` on protected columns in addition to RLS.
- **Rate limits:** auth email resend (1/min); `send-document`, `remind` (per user); all guest endpoints
  (per token + IP); OTP verify (5 attempts).
- Input validation with Zod on the client **and** in Edge Functions. Never trust client-computed status,
  order, or completeness.
- Storage is encrypted at rest (Supabase default). Signed URLs are short-lived.
- No secrets in the app, and no logging of tokens, OTPs, or signature images.
- Dependency audit in CI. Confirm Sentry PII scrubbing.

---

## 15. Error handling

Typed error codes are shared between client and server (`/shared/errors.ts`), and each is mapped to
friendly, actionable copy.

| Code                            | When                                                                     | UX                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `FILE_UNSUPPORTED`              | Not PDF/JPEG/PNG/HEIC, or encrypted PDF                                  | Inline error on the source step                                                        |
| `FILE_TOO_LARGE`                | Above the §9 limits                                                      | Explain the limit                                                                      |
| `UPLOAD_FAILED`                 | Network/storage error                                                    | Retry button; resumable if possible                                                    |
| `PDF_RENDER_FAILED`             | Corrupt or unrenderable PDF                                              | Error state with "Try again" / "Contact support"                                       |
| `NETWORK_OFFLINE`               | No connectivity                                                          | Global banner; queries show cached data read-only; mutations disabled with explanation |
| `INVALID_EMAIL`                 | Recipient form                                                           | Field-level error                                                                      |
| `LINK_EXPIRED` / `LINK_INVALID` | Guest token                                                              | Dedicated guest error page with sender contact                                         |
| `NOT_YOUR_TURN`                 | Signing before group activation                                          | Explain who is pending                                                                 |
| `FORBIDDEN`                     | RLS/authorization failure                                                | "You don't have access to this document"                                               |
| `INVALID_STATE`                 | Action not allowed in current status                                     | Refresh document, explain                                                              |
| `RATE_LIMITED`                  | Too many requests                                                        | Show the cooldown                                                                      |
| `INVALID_INPUT`                 | Request failed validation                                                | Field-level error or generic copy                                                      |
| `NOT_FOUND`                     | Document missing, deleted, or not accessible (existence is not revealed) | Not-found state                                                                        |
| `SIGNATURE_LIMIT`               | 6th saved signature or initials of a kind                                | Explain the limit; point to Account → Signatures                                       |
| `SIGNATURE_TOO_SIMPLE`          | Drawn signature too small (dot/scribble) or no ink                       | Inline message in the signature sheet                                                  |

**Offline policy (MVP):** read-only. TanStack Query persisted cache for lists and details. No offline
signing (it would weaken the audit trail).

---

## 16. Mobile UX & accessibility requirements

- Safe areas, keyboard avoidance on every form, pull-to-refresh on lists, skeletons for initial loads,
  empty and error states on every data view, haptics on key confirmations (send, sign, delete).
- Accessibility: every interactive element has `accessibilityLabel`/`Role`. Minimum 44×44 pt touch
  targets. Supports Dynamic Type/font scaling. VoiceOver/TalkBack can complete the full signing flow,
  using **Type** signature as the accessible alternative to drawing. Field reordering has button
  controls, not only drag. Use `aria-*` state props (`aria-checked`, `aria-selected`, `aria-disabled`)
  rather than `accessibilityState`, which React Native Web does not expose.
- Device-local data: unsaved signature PNGs live in the app's cache directory (blob URLs on web) and
  are deleted at sign-out and on account switch. The viewer never writes documents to disk.
- Empty-state copy:
  - No documents: "You haven't uploaded any documents yet."
  - Needs signature: "You're all caught up. No documents need your signature."
  - Search: "No documents match your search."
  - Activity: "Activity on your documents will appear here."
  - Notifications: "No notifications yet."

---

## 17. Legal & compliance (product requirements; get legal review before launch)

### 17.1 ESIGN/UETA consent

Before a signer's first interaction with a document, show the **Consumer Disclosure** (versioned text in
`/constants/legal`): consent to use electronic records and signatures, the right to receive paper copies,
how to withdraw consent, and hardware/software requirements. Record it in `esign_consents` and log
`ESIGN_CONSENT_ACCEPTED`. Intent to sign is captured by the explicit **Finish** confirmation. The
certificate (§12.2) is the record.

### 17.2 Retention

Completed documents, certificates, and audit logs are retained for all participants even if the owner
hides the document. Default retention is indefinite while the owner's account exists (§22 open question
on policy after account deletion).

### 17.3 Account deletion (App Store guideline 5.1.1(v), Google Play policy)

In-app "Delete account" with re-authentication. It deletes the profile, saved signatures, push tokens,
drafts, and uploads, and signs out everywhere. For documents the user sent or signed that involve other
parties, the user's PII on those records is retained as legally required for the other participants and
documented in the privacy policy.

### 17.4 Store requirements

Sign in with Apple is offered wherever Google sign-in is offered on iOS. Privacy policy and terms are
linked in-app and in the stores. Privacy nutrition labels / data safety forms are prepared in P8.

---

## 18. Project structure

```
/app                      # Expo Router routes only (thin: compose feature screens)
/src
  /components             # Shared UI: AppButton, AppInput, AppText, Card, StatusBadge, EmptyState,
                          #   LoadingSkeleton, BottomSheet, ConfirmationModal, Avatar, ListRow, Screen
  /features
    /auth                 # screens, hooks, api, schemas
    /onboarding
    /documents            # DocumentCard, filters, list, details
    /upload
    /editor               # FieldToolbar, FieldOverlay, PropertiesSheet
    /signatures           # SignatureSheet (Draw/Type/Upload), Account → Signatures, PNG pipeline [P3]
    /viewer               # PdfSurface (WebView / iframe), SurfaceSession, ViewerScreen [P3]
    /signing              # SigningScreen
    /recipients           # RecipientCard, RecipientForm
    /activity
    /notifications
    /account
  /lib                    # supabase client, queryClient, queryKeys, i18n, storage adapter
  /store                  # Zustand stores
  /theme                  # tokens, ThemeProvider, useTheme
  /hooks
  /utils
  /constants              # copy, legal disclosures, limits
  /types                  # generated Supabase types (supabase gen types) + domain types
/shared                   # Zod schemas, error codes, geometry.ts, pdfBridge.ts — imported by app AND functions
/web/pdf-surface          # pdf.js surface source; `npm run build:surface` → assets/pdf-surface/surface.html
/supabase
  /migrations
  /functions              # one folder per Edge Function + _shared/
  /tests                  # pgTAP tests (RLS!)
  seed.sql                # local-dev seed data only
/e2e                      # Maestro flows
/assets                   # fonts (licensed), icons (original), images
```

Rules: no file over ~300 lines without a reason. Routes contain no business logic. Generated DB types
are committed and regenerated whenever a migration changes.

---

## 19. Testing & quality gates

Every phase must pass, **before** it is reported done:

- `tsc --noEmit`, ESLint, and Prettier are clean.
- Unit tests (Jest + RNTL) for new components, hooks, and Zod schemas.
- **pgTAP tests for every RLS policy introduced**, including negative cases (user B cannot read/update
  user A's document; recipients cannot change status; nobody can update/delete events).
- Deno tests for every Edge Function (happy path + authorization failure + invalid state).
- From P4: coordinate golden tests (§8.1). From P6: Maestro E2E for upload → send → sign (in-app) → completed.
- `supabase db reset` runs migrations and seed from scratch without errors.
- README is updated with any new setup steps and env vars, and `.env.example` is kept current.

---

## 20. Build phases

Each phase ends with a **phase report**: what was built, files created, migrations, test results, and
an explicit list of TODOs/stubs and known issues. **Stop for review after each phase.**

| Phase                                     | Scope                                                                                                                                                                                                                                                                              | Done when…                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P1 Foundation**                         | Project setup, theme/tokens, core components, i18n scaffolding, Expo Router structure, onboarding, all auth screens + Apple/Google, profiles + core schema (documents, recipients, events), RLS + pgTAP, dashboard summary RPC, Home with real queries + seed data, Account basics | See `prompts/phase-1.md`                                                                                                                                                       |
| **P2 Upload & library**                   | Upload sources (Files, scan, images→PDF), `process-upload`, storage buckets/policies, Documents tab (filters, search, sort, pagination), details (basic), rename, delete draft, download, avatar                                                                                   | A user uploads a 3-page PDF and a scanned document, sees both in the library with correct page count/size, finds them by search, and cannot access another user's file by path |
| **P3 Viewer & signatures**                | **Spike first:** pdf.js WebView renderer + coordinate round trip (place a box in the app → flatten server-side → position correct ±1 pt on the fixture set). Then the viewer (zoom, page jump) and signature creation (draw/type/upload), saved signatures                         | Spike report + golden tests pass; the user creates, saves, and reuses a signature                                                                                              |
| **P4 Field editor**                       | Editor with MUST field types, drag/resize, recipient assignment (placeholder recipients allowed in drafts), properties, autosave                                                                                                                                                   | Fields placed on portrait + landscape + rotated pages persist and reload in the exact same positions                                                                           |
| **P5 Recipients & send**                  | Recipient step, ordering, review & send, `send-document`, tokens, email via Resend, recipient linking                                                                                                                                                                              | Sending to 2 sequential signers emails only the first; the draft is locked after sending                                                                                       |
| **P6 Signing & completion**               | In-app signing, guest web signing (web export + universal links), ESIGN consent, decline, `submit-signing`, `finalize-document`, certificate                                                                                                                                       | Owner + 1 guest + 1 CC complete a document; everyone receives the flattened PDF + certificate; the hashes on the certificate match the files                                   |
| **P7 Activity, notifications, reminders** | Activity tab, document timeline, in-app inbox, push, reminders, expiry, void, remind, notification prefs                                                                                                                                                                           | Reminders and expiry fire from cron in local dev (time-travel test); push arrives on a device build                                                                            |
| **P8 Hardening & release**                | Rate limits review, security review, biometric unlock, 2FA, account deletion, Sentry, accessibility audit, performance (200-page PDF), store assets, privacy labels                                                                                                                | Security checklist signed off; E2E suite green on iOS + Android builds                                                                                                         |

---

## 21. Future-ready architecture (LATER, do not build)

Teams/organizations, templates, bulk send, public API, webhooks, CRM integrations, cloud drives
(Google Drive, Dropbox, OneDrive, Box), custom branding, subscription plans, and enterprise SSO.

To keep these cheap later:

- Authorization goes through the helper functions (§14), so adding `org_id` later changes the helpers,
  not every policy.
- Side effects (email/push/webhooks) go through one `notify(event)` dispatcher in `_shared/`.
- Document sources go through an `ImportSource` interface in `/features/upload`.
- No assumptions in the UI that the owner is the only sender.

---

## 22. Open questions (owner to answer)

1. Production domain for the signing links and universal links (`sign.<domain>`)?
2. Email sender domain and provider account (Resend assumed)?
3. Supabase project region (data residency, e.g. EU vs US)?
4. Legal review of the ESIGN disclosure, terms, privacy policy, and the retention policy after account deletion?
5. Any jurisdictions requiring qualified/advanced signatures (eIDAS), which would pull PAdES forward?
6. Pricing/plan limits (documents per month, storage quota)?
7. Brand assets: logo, app icon, and the final primary color (the §3 tokens are placeholders but usable)?
