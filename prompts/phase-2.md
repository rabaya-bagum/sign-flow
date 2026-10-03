# Phase 2 prompt — Upload & document library

> Paste everything below the line into your coding agent. It assumes Phase 1 is merged and `SPEC.md` is
> current.

---

You are continuing work on **SignFlow**. The product and technical specification is in **`SPEC.md`** at
the repo root and is the source of truth. Phase 1 (foundation: design system, navigation, auth, core
schema with RLS, Home dashboard) is complete. Where this prompt and the spec disagree, follow this prompt
for Phase 2 scope and tell me about the conflict.

## Goal of Phase 2
Users can **get documents into SignFlow and manage them**: upload a PDF from Files, scan a paper
document, or turn photos into a PDF. The server validates and processes every upload. Users can browse,
filter, search, sort, rename, download/share, and delete documents in a real library, and every file is
protected so only authorized users can reach it.

This is also the phase that sets up **Edge Function and Storage conventions** for the rest of the
project, so get them right.

## Working agreement
1. **Read first.** Read `SPEC.md` (especially §5.2, §5.3 steps 1–2, §5.4, §5.9, §6.2, §8, §9, §10, §14,
   §15) and the existing codebase, including Phase 1's migrations, tests, and README. Note any drift
   between the code and the spec.
2. **Plan, then stop.** Before writing code, reply with:
   - architecture of the upload pipeline (client → storage → `process-upload` → DB), including failure
     and retry paths
   - Edge Function conventions you'll establish in `supabase/functions/_shared/` (auth context, error
     envelope, Zod validation, `logEvent` with IP/user agent, rate limiter, service-role client)
   - files to create or change
   - migration plan (tables, buckets, storage policies, RPCs, indexes)
   - library choices with versions
   - risks, especially Edge Function memory/time limits with large PDFs, and anything in the spec you
     think is wrong

   **Then wait for my approval.**
3. Small, logical commits. **No silent fakes.** Seed data only in `supabase/seed.sql`. Anything stubbed is
   visibly labelled in the UI and listed in your report.
4. Don't build later phases: no PDF rendering/viewer, signatures, field editor, recipients UI, sending,
   push, or the Activity feed. Where the UI touches them, show a labelled placeholder ("Preview arrives in
   Phase 3").
5. Ask when the spec is ambiguous. Don't invent product behavior.

## In scope

### A. Database & storage (migrations only)
- `document_pages` and `rate_limits` tables per SPEC §8, plus the `documents.deleted_at` column if
  Phase 1 didn't add it.
- Buckets per SPEC §9, created in a migration: `documents`, `uploads-tmp`, `avatars`. All private, with
  `file_size_limit` and `allowed_mime_types` set. Add `signatures` only if trivial; it is a Phase 3 need.
- Storage RLS policies:
  - `documents`: the owner may **insert** exactly `{owner_id}/{document_id}/original.pdf` only while that
    document is `draft`, not soft-deleted, and has no `original_path` yet. No client update, delete, or
    select: reads go through `get-download-url` signed URLs.
  - `uploads-tmp`: the owner may insert/select/delete within `{user_id}/`.
  - `avatars`: the owner may insert/update/delete `{user_id}/avatar.jpg`. Authenticated users may read
    (served via signed URLs).
- Soft delete: every documents policy and RPC excludes rows where `deleted_at is not null`. Also exclude
  rows hidden via `document_user_state.hidden_at` for that user, in list/search/dashboard RPCs (not in
  direct detail access).
- RPCs (security invoker, SPEC §6.3 bucket definitions, one source of truth shared with
  `get_dashboard_summary`):
  - `list_documents(bucket, search, sort, filters jsonb, cursor, limit)`. Sort: `newest | oldest |
    title`. Filters: created range, modified range, sender (owner id), recipient (name/email substring).
    **Keyset pagination**, not offset. Returns per row: id, title, display status, updated_at,
    file_size_bytes, page_count, owner name, the first 3 participants (name, email) plus a total count,
    progress (`completed signers+approvers / total signers+approvers`), and an `upload_incomplete` flag
    (`original_path is null`).
  - `search_documents(q)`: matches title, recipient name, recipient email (ILIKE + `pg_trgm` indexes),
    only within documents the caller can access. Grouped by document, limit 20.
  - `get_storage_usage()`: bytes and document count for documents the caller owns.
  - Update `list_recent_documents` to order by `coalesce(document_user_state.last_opened_at, updated_at)`.
- Seed updates: give seed documents realistic `file_size_bytes`, `page_count`, and `document_pages`
  values. Upload real fixture PDFs to local storage in the seed (or a seed script) so download works on
  seed data.

### B. Edge Functions (SPEC §10), with `_shared/` conventions
- **`process-upload`** (owner only, rate-limited, e.g. 30/hour/user). Input: `{ document_id }` for a PDF
  already in storage, or `{ document_id, image_paths[] }` for images in `uploads-tmp`.
  - PDF path: download `original.pdf` from storage, verify the `%PDF-` magic bytes, size ≤ 25 MB, loads in
    `pdf-lib` **without** `ignoreEncryption` (encrypted → `FILE_UNSUPPORTED`), page count 1–200. Compute
    SHA-256. Insert `document_pages` (displayed width/height in points after applying `/Rotate`, plus the
    rotation). Set `original_path`, `original_sha256`, `file_size_bytes`, `page_count` using the service
    role.
  - Images path: ≤ 30 images, JPEG/PNG only (HEIC is converted on device). One page per image, A4 with
    orientation matching the image, image fitted with a 24 pt margin. Write `original.pdf`, then run the
    same processing as above, then delete the temp images.
  - On validation failure: delete the stored object, leave the draft without a file, and return a typed
    error (SPEC §15). The function must be **idempotent**: calling it twice for an already-processed
    document returns the existing result.
  - Logs `DOCUMENT_UPLOADED`.
  - **Measure** peak memory and duration on a 25 MB / 200-page fixture and report both. If it doesn't fit
    within Supabase Edge Function limits, stop and propose options. Don't silently lower the limits.
- **`get-download-url`** (owner or authorized participant): `{ document_id, kind: 'original' }` (other
  kinds return `INVALID_STATE` until Phase 6). Authorizes with the same rules as RLS, logs
  `DOCUMENT_DOWNLOADED`, and returns a signed URL with TTL ≤ 5 min plus a suggested file name.
- **`delete-draft`** (owner, draft only): sets `deleted_at`, removes all storage objects under the
  document folder, logs `DOCUMENT_DELETED`.
- `DOCUMENT_CREATED` and `DOCUMENT_RENAMED` are logged by DB triggers through `log_event`.

### C. Creation wizard, steps 1–2 (SPEC §5.3)
- Route stack `documents/new/source` → `documents/new/details`, with a step indicator. Step 3 onward is a
  labelled placeholder ("Recipients arrive in Phase 5"). The user can exit, and the draft stays in Drafts.
- **Source step:**
  - **Choose PDF:** `expo-document-picker` (PDF only). Client-side checks for type and the size limit
    before uploading.
  - **Scan document:** `react-native-document-scanner-plugin` (multi-page, JPEG out).
  - **Photos → PDF:** `expo-image-picker` (multi-select, ≤ 30). Convert HEIC to JPEG and downscale to a
    long edge ≤ 2500 px with `expo-image-manipulator`. Show selected thumbnails, with reorder (up/down
    buttons, drag optional) and remove.
- **Upload flow:**
  1. Insert the draft `documents` row (title = file name without extension, or "Scan YYYY-MM-DD").
  2. Upload the file. Use **resumable TUS uploads** (Supabase Storage TUS endpoint) for files over 6 MB,
     with a visible progress bar and cancel.
  3. Call `process-upload`.
  4. Go to Details.

  Every failure shows the SPEC §15 copy with retry. A draft with `upload_incomplete` is resumable from
  its card ("Upload incomplete — Retry / Delete").
- **Details step:** edit the title (1–200 chars, Zod). It shows page count and size returned by
  processing.

### D. Documents tab (SPEC §5.2)
- Segmented filters: All · Needs signature · Waiting · Drafts · Completed · Closed. Reads the `bucket`
  param from Home.
- Search field (debounced 300 ms), sort menu, and a filter bottom sheet (status, created range, modified
  range, sender, recipient), with an active-filter count badge and "Clear".
- `DocumentCard`: title, updated date, participant avatars (max 3 + "+n"), `StatusBadge`, progress, file
  size, ⋯ menu.
- ⋯ menu, **status-dependent per the SPEC §6.2 table**: Open (→ details) · Rename (draft only) ·
  Download/Share · Delete (draft → `delete-draft` with confirmation; sent/terminal → "Remove from my
  library", which sets `hidden_at`). Void, Duplicate, and Remind are not shown yet (later phases); don't
  render disabled items for them.
- Infinite scroll (20 per page), pull-to-refresh, skeletons, empty states per bucket (SPEC §16 copy),
  and an error state with retry.
- Grid view and swipe actions are **optional stretch goals**. Build them only if everything else is
  done, and say so in the report.

### E. Document details, basic (SPEC §5.4)
- Title, status banner (display status + one-line explanation), info (pages, size, created, updated,
  sender), and a recipients list (name, "(You)", email, role, order, status) read-only.
- Actions per status: Rename (draft) · Download · Share · Delete / Remove from my library. "Preview" and
  "Continue editing" are labelled placeholders.
- Opening details upserts `document_user_state.last_opened_at`.

### F. Download & share
- `get-download-url` → download to cache with `expo-file-system` → `expo-sharing` share sheet (iOS
  "Save to Files" lives there). Delete the cached file afterwards. On Android, also offer "Save to
  device" via the Storage Access Framework if straightforward; otherwise the share sheet only (report
  which).

### G. Global search (SPEC §5.9)
- Wire Home's search button to the `search` modal: debounced, results grouped by document with the
  matched recipient shown, tap → details, empty state "No documents match your search."

### H. Account additions
- **Profile photo:** pick, square crop, resize to 512 px, upload to `avatars`, display via signed URL
  (cached), and remove.
- **Storage section:** used storage (human-readable) and document count from `get_storage_usage()`.

### I. Home wiring
- The "Upload document" CTA and the + button open the wizard. The info button opens details. Summary
  rows open Documents with the real bucket filter. Remove the Phase 1 placeholders these replace.

### J. Fixtures
Add a fixture generator script (pdf-lib) that produces: a 3-page portrait PDF, a landscape PDF, a page
rotated 90°, mixed page sizes, an encrypted PDF, a corrupt file with a `.pdf` extension, a PNG renamed to
`.pdf`, and an over-limit (201-page) PDF generated at test time. Phase 3 will reuse these for coordinate
golden tests, so commit the small ones.

## Out of scope for Phase 2
PDF rendering/preview, thumbnails, signatures, field editor, recipients editing, sending, email, push,
reminders, void, duplicate, the Activity tab, cloud-drive imports, and quota enforcement.

## Acceptance criteria. All must be demonstrably true.
1. `typecheck`, `lint`, Jest, pgTAP, and Deno tests all pass. `supabase db reset` works from scratch,
   including seed files.
2. A user uploads a **3-page PDF** and a **2-page scan** (or 2 photos → PDF). Both appear in Drafts with
   the correct page count, file size, and `document_pages` rows (verified against the fixtures, including
   the landscape and rotated ones).
3. Uploading each bad fixture (encrypted, corrupt, PNG-as-PDF, oversized, 201 pages) shows the correct
   SPEC §15 error, leaves no orphaned storage object, and leaves a resumable draft.
4. A file over 6 MB uploads with a visible progress bar and survives a brief network drop (resume) on a
   device or simulator.
5. **pgTAP / integration tests prove:**
   - user B cannot select, download, or sign a URL for user A's `original.pdf`, by RPC, storage API, or by
     guessing the path
   - the owner cannot overwrite or delete `original.pdf` after processing, and cannot insert a file at
     any other path in `documents`
   - `list_documents` and `search_documents` never return documents the caller can't access. Searching
     for another user's recipient email returns nothing.
   - soft-deleted drafts disappear everywhere, and hidden documents disappear from lists but stay
     reachable by direct link for authorized users
   - each bucket in `list_documents` matches `get_dashboard_summary` counts for both seed users
   - keyset pagination returns every row exactly once across pages for each sort
6. Deno tests cover `process-upload` (valid PDF, each bad fixture, images path, wrong owner, non-draft
   document, idempotent re-call), `get-download-url` (authorized, unauthorized, wrong kind), and
   `delete-draft` (draft, non-draft, wrong owner).
7. Download/share works on iOS and Android, and logs `DOCUMENT_DOWNLOADED` with IP and user agent
   captured server-side.
8. Search finds documents by title, recipient name, and recipient email within 300 ms locally on seed data.
9. Light/dark mode, largest font size, and screen-reader labels work on every new screen. The filter
   sheet and reorder controls are fully usable without drag gestures.
10. README is updated (TUS, storage buckets, Edge Function local serving and secrets, fixture
    generation). `.env.example` is current, with no secrets in the app.

## Final phase report (required format)
1. **Summary:** what was built.
2. **File tree** of created/changed files.
3. **Migrations:** list with a one-line purpose each.
4. **Edge Function conventions:** a short description of `_shared/` for future phases.
5. **Test results:** command output summary for typecheck, lint, Jest, pgTAP, and Deno.
6. **Performance:** `process-upload` memory and duration for the small fixture and the 25 MB / 200-page
   fixture.
7. **Acceptance criteria:** each item marked ✅ / ⚠️ / ❌ with evidence.
8. **Stubs & TODOs:** every placeholder and its target phase, plus which stretch goals were done.
9. **Spec issues:** anything in `SPEC.md` you found wrong, ambiguous, or risky, with a proposed fix.
10. **Next:** anything Phase 3 needs from me.

Start with step 1 of the working agreement: read the spec and codebase, then send me your plan and wait.
