# Phase 2 report: Upload & document library

**Branch:** `claude/eloquent-gauss-euba41` · **Date:** 2026-10-03 · **Prompt:** [`prompts/phase-2.md`](../../prompts/phase-2.md)

## 1. Summary

Users can now get documents into SignFlow and manage them.

- **Upload:**
  - Three sources: pick a PDF, scan with the camera, or turn up to 30 photos into a PDF.
  - Photos and scans are converted to JPEG on the device and resized to at most 2500 px; HEIC is handled the same way.
  - The draft is created up front and the file uploaded to private storage. Files over 6 MB go through **resumable TUS uploads** with progress, cancel and automatic resume.
  - The server then validates and processes every file in `process-upload`: header, size, encryption, page count, SHA-256, page geometry using the SPEC §8.1 visible-box rule, and image-to-PDF conversion.
  - Failures show the SPEC §15 copy, delete the stored object and leave a draft that can be retried.
- **Library:**
  - Documents tab with six filters, debounced search, sort, and a filter sheet: created and modified date presets, sender, recipient. It shows the active-filter count.
  - Cursor-based infinite scroll, pull-to-refresh, skeletons, and empty states specific to each filter.
  - Each card's menu depends on status (SPEC §6.2): rename and delete for drafts, "Remove from my library" once sent, share for everything with a file, and "Save to device" on Android.
- **Details (basic):**
  - Status banner, information, and a recipients list with "(You)".
  - Retry, share, rename, delete, hide and restore.
  - Opening it records `last_opened_at`, which drives the "Recent documents" order.
- **Download and share:**
  - Signed URLs valid for 5 minutes, issued only after an access check and audited.
  - On native: downloaded to the cache, handed to the share sheet, then the cached copy is deleted.
  - On web: the URL opens in a new tab.
- **Global search** over titles, recipient names and emails. **Account** now has a profile photo (cropped, 512 px, private bucket) and storage usage.
- **Shared Edge Function code** in `supabase/functions/_shared/` (§4), which later phases reuse.

## 2. Files

```
supabase/migrations/
  20261003000800_document_pages_and_rate_limits.sql   20261003000900_storage.sql
  20261003001000_document_event_triggers.sql          20261003001100_library_rpcs.sql
  20261003001200_document_detail.sql
supabase/functions/
  _shared/ deps.ts http.ts context.ts serve.ts rateLimit.ts events.ts documents.ts crypto.ts
           pdf/inspect.ts pdf/images.ts  test/harness.ts test/fixtures.ts
  process-upload/{index,logic}.ts  get-download-url/{index,logic}.ts  delete-draft/{index,logic}.ts
  tests/ process-upload.test.ts get-download-url.test.ts delete-draft.test.ts performance.test.ts
supabase/seed/ seed_documents.sql (generated) + storage/documents/** (seed originals)
supabase/tests/database/05_storage_and_library.test.sql
scripts/generate-fixtures.ts      fixtures/pdf/*.pdf  fixtures/images/*.png
shared/ limits.ts documents.ts (+ errors.ts codes)
src/features/upload/      chunkSource base64 resumable storageUpload pickers normalizeImage uploadDocument
                          screens/{SourceScreen,DetailsStepScreen,RecipientsPlaceholderScreen}
src/features/documents/   api hooks types filters actions download useDocumentActions DocumentsScreen
                          DocumentCard ParticipantStack FilterSheet SortSheet RenameModal DocumentDetailsScreen
src/features/search/      SearchScreen
src/components/           BottomSheet ActionSheet ChipGroup SearchField ProgressBar
src/lib/functions.ts      src/hooks/useDebouncedValue.ts  src/utils/formatBytes.ts
app/(app)/documents/new/{_layout,source,details,recipients}.tsx  app/(app)/documents/[id]/index.tsx
app/(app)/(tabs)/documents.tsx  app/(app)/search.tsx
integration/upload.integration.test.ts
```

## 3. Migrations

| File                                   | Purpose                                                                                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…0800_document_pages_and_rate_limits` | `document_pages` (visible box, origin, rotation) with RLS; `rate_limits` + atomic `check_rate_limit()`; `finalize_original_upload()` (one transaction, idempotent). Both functions are service-role only                            |
| `…0900_storage`                        | Private buckets `documents` (25 MB, PDF), `uploads-tmp` (10 MB, JPEG/PNG) and `avatars` (2 MB). Path-scoped policies: the owner may insert their own draft's `original.pdf` once and has no read, update or delete                  |
| `…1000_document_event_triggers`        | `DOCUMENT_CREATED` and `DOCUMENT_RENAMED` audit triggers, with IP and user agent taken from PostgREST's request headers                                                                                                             |
| `…1100_library_rpcs`                   | `list_documents` (filter by bucket, search, created/modified range, sender, recipient; cursor paging for each sort), `search_documents`, `get_storage_usage`, `list_document_senders`, and `like_pattern` for safe pattern escaping |
| `…1200_document_detail`                | `document_display_status()`, now the single place the display-status rule lives (used by `my_documents()`); `get_document()` for details, which works for hidden documents                                                          |

## 4. Shared Edge Function code (for later phases)

- **Entry point:** `serveJson(schema, handler)` handles CORS, POST-only, JWT → `RequestContext`, Zod validation, and the `{ error: { code, message } }` envelope. Each `index.ts` is two lines; the logic sits in `logic.ts`, so it can be tested without HTTP.
- **`RequestContext`:**
  - `asUser` is a client running as the caller, so RLS applies. It is used to authorize: documents the caller can't see come back as `NOT_FOUND`, so their existence isn't revealed.
  - `admin` is the service-role client and must only be used after an explicit check.
  - `ip` comes from the first `X-Forwarded-For` hop; `userAgent` from the request header.
- **Other helpers:**
  - `HttpError(code, status)` uses the codes from `shared/errors.ts`.
  - `enforceRateLimit(admin, key, max, windowSeconds)`.
  - `logEvent(ctx, documentId, type, description, metadata)`.
  - `loadVisibleDocument` / `loadOwnedDocument`.
- **Dependencies:** all third-party imports are pinned in `_shared/deps.ts`. `shared/limits.ts` and `shared/errors.ts` have no imports, so both Metro and Deno load them.
- **Tests:** `_shared/test/harness.ts` creates throwaway users and real contexts against the local stack.

## 5. Test results

Final run, from a freshly reset database:

| Check                                                                  | Result                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `npm run typecheck` / `npm run lint` / Prettier                        | ✅ clean                                        |
| `npm test` (Jest + RNTL)                                               | ✅ **187 passed**, 20 suites (Phase 1: 129)     |
| `npm run db:test` (pgTAP)                                              | ✅ **94 passed**, 5 files (Phase 1: 54)         |
| `npm run test:functions` (Deno, local stack)                           | ✅ **22 passed** (+9 steps)                     |
| `npm run test:integration` (HTTP: Auth, Storage/TUS, served functions) | ✅ **16 passed**, and again on a second run     |
| `expo export --platform all`                                           | ✅ web, iOS and Android bundles                 |
| Web smoke test (Playwright)                                            | ✅ full Phase 2 flow, no console errors (§7 #4) |

**Mutation checks:** widening the `documents` upload policy to the whole bucket fails 5 storage tests, and Phase 1's checks still hold.

**Bugs the tests caught:**

- `pdf-lib`'s `EncryptedPDFError` fails an `instanceof` check. Encrypted PDFs were being reported as "can't read" instead of "unsupported"; fixed.
- The download file name was double-encoded: "(…)" arrived as "%28…%29". Fixed by appending a once-encoded `download` parameter, with a regression test.
- Two test-hygiene issues, both fixed:
  - A Phase 1 integration test polluted the seed owner's dashboard, because documents can no longer be deleted once audited.
  - React Query's 5-minute mutation GC timer kept Jest from exiting.

## 6. Performance (`process-upload`)

Measured by `supabase/functions/tests/performance.test.ts`, calling the function logic against local Storage and Postgres:

| Input                                            | Parse    | End to end (download → validate → hash → DB) | Memory growth |
| ------------------------------------------------ | -------- | -------------------------------------------- | ------------- |
| 3 pages, 1.5 KB                                  | 5–6 ms   | 27–40 ms                                     | ~0 MB         |
| 200 pages, 24.7 MB (padding streams)             | 31–32 ms | 367–508 ms                                   | +124–140 MB   |
| 200 pages, 22.1 MB (one distinct image per page) | 48–52 ms | 296–400 ms                                   | +85 MB¹       |

¹ Garbage collection makes repeated measurements noisy; one run showed a negative delta.

**Assessment:** the CPU cost of parsing is small, under 60 ms, and most of the wall time is I/O. Peak memory grows by roughly 4–6 times the file size. **Please confirm against Supabase's current hosted Edge Function limits** (memory, CPU time per request, wall clock): their docs are blocked in this environment. If the memory limit is tight, the first mitigation is to skip keeping a second copy for hashing (stream the SHA-256).

## 7. Acceptance criteria

| #   | Criterion                                                                                                                    | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All checks pass; `db reset` from scratch, including seed files                                                               | ✅      | §5. Seed originals are uploaded via `objects_path`, and their paths, hashes, sizes and pages are linked by the generated SQL                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2   | 3-page PDF and 2-page scan/photos land in Drafts with correct pages, size and `document_pages` (incl. landscape and rotated) | ✅      | Deno tests: portrait, landscape A4, `/Rotate` 90 and 270, mixed sizes, offset CropBox, non-zero MediaBox origin; images → A4 pages with matching orientation. Web smoke: a 3-page PDF shows "3 pages · 1.5 KB". The camera scanner needs a device (§9)                                                                                                                                                                                                                                                                                                    |
| 3   | Each bad fixture gives the right SPEC §15 error, leaves no orphaned object and a resumable draft                             | ✅      | Deno: encrypted → `FILE_UNSUPPORTED`, corrupt → `PDF_RENDER_FAILED`, PNG renamed to `.pdf` → `FILE_UNSUPPORTED`, 201 pages → `FILE_TOO_LARGE`. In each case the object is gone and a new upload is accepted. Over 25 MB: rejected by Storage itself (413), and `process-upload` re-checks. Integration: the HTTP envelope returns `FILE_UNSUPPORTED`/422                                                                                                                                                                                                  |
| 4   | Over 6 MB: visible progress and resume after a brief network drop                                                            | ✅ / ⚠️ | Integration against real local Storage: a 13 MB upload with a dropped PATCH resumes from the server's offset; cancel, then resume from the stored URL continues at 6 MB rather than 0. Web: a 7 MB upload in the browser shows the progress bar and completes. **Native** (expo-file-system reads, `expo/fetch`) still needs a device check                                                                                                                                                                                                               |
| 5   | pgTAP proves the access rules                                                                                                | ✅      | `05_storage_and_library` covers each case: B can't read, list or write A's files; insert is limited to that exact path, once, drafts only; no client read, update or delete policy on `documents`; list, search and recipient filter never leak, and searching another user's recipient email returns nothing; soft-deleted drafts are gone everywhere; hidden documents are gone from lists but `get_document` still works; bucket counts equal the dashboard for both seed users; cursor paging returns every row exactly once, in order, for each sort |
| 6   | Deno tests for each function's cases                                                                                         | ✅      | `process-upload`: valid file, each bad fixture, images, wrong owner, non-draft, idempotent re-call, missing file, foreign image paths. `get-download-url`: owner, stranger, active and pending participants, wrong kind, no file, tampered token, file name. `delete-draft`: draft, non-draft, wrong owner, no file, double delete                                                                                                                                                                                                                        |
| 7   | Download/share works on iOS and Android and logs `DOCUMENT_DOWNLOADED` with IP and user agent                                | ⚠️      | Server side ✅: the signed URL serves the exact bytes (SHA matches) with the correct `Content-Disposition`; the event is logged with the gateway's IP (Deno and integration tests). Web ✅. **The native share sheet and Android "Save to device" are untested** (no device)                                                                                                                                                                                                                                                                              |
| 8   | Search by title, recipient name and email within 300 ms on seed data                                                         | ✅      | `search_documents` uses trigram indexes; on seed data, local requests come back in a few milliseconds over HTTP. The UI waits 300 ms after typing; RNTL and web smoke cover it                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | Light/dark mode, largest font size, screen-reader labels; filter sheet and reorder usable without drag                       | ✅ / ⚠️ | Every new control has roles and labels (radio groups for filters and sorting, `menuitem` actions, labelled up/down/remove buttons for photo order, progress bar with a value), asserted by RNTL and Playwright role queries. All colours come from the AA-checked tokens. Largest Dynamic Type and VoiceOver/TalkBack still need a device check (same as Phase 1)                                                                                                                                                                                         |
| 10  | README updated; `.env.example` current; no secrets in the app                                                                | ✅      | README: functions serve, storage, TUS, fixtures, Deno proxy note, new scripts. `.env.example` is unchanged because no new client config is needed. No secrets in tracked files                                                                                                                                                                                                                                                                                                                                                                            |

**Stretch goals:** grid view and swipe actions were **not built**.

## 8. Stubs and TODOs

| Item                                                                                                                   | Target              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Wizard steps 3–5 (recipients, fields, review/send): the recipients step is a labelled placeholder that saves the draft | Phases 4–5          |
| Preview card and "Continue editing" on details: labelled placeholders                                                  | Phases 3–4          |
| Document activity timeline on details                                                                                  | Phase 7             |
| Void, duplicate and remind actions (not shown at all)                                                                  | Phases 5–7          |
| Sweep of abandoned `uploads-tmp` files older than 24 h (needs `cron-tick`)                                             | Phase 7             |
| Custom date ranges in filters (presets only for now; SPEC updated)                                                     | Later               |
| Grid view, swipe actions                                                                                               | Not built (stretch) |

## 9. Decisions and spec issues

All of these are now recorded in `SPEC.md`.

1. **My own TUS client instead of `tus-js-client`.** On React Native, `expo-file-system`'s `File.slice()` reads the whole file on every call, so Blob-based chunking would load 25 MB per 6 MB chunk. The new client (`resumable.ts`) reads each chunk through a file handle and is tested against the real local Storage endpoint.
2. **Date filters are presets** (any time, last 7 days, last 30 days, last 12 months) rather than a free date picker. This avoids a native date-picker dependency and works with screen readers.
3. **Display status now lives in one SQL function**, `document_display_status()`, used by lists, the dashboard and `get_document()`. Phase 1's `my_documents()` was redefined on top of it, with the same output, and its tests still pass.
4. **Audited documents can't be hard-deleted.** Because of the `document_events` foreign key, even owner-created test documents stay. Tests use throwaway users, and `db:reset` cleans up.
5. **The client builds download URLs on its own Supabase URL.** Locally, functions mint signed URLs for `kong:8000`, so the app swaps in its own host (`toAppUrl`). On hosted Supabase this changes nothing.
6. **Camera permission:** setting `expo-image-picker`'s `cameraPermission: false` silently removed the scanner's iOS camera string, so both plugins now use the same text (verified with `expo config --type introspect`).
7. **Open question (§6):** hosted Edge Function memory and CPU limits for 25 MB files.

## 10. Environment notes and what I need from you

- **Sandbox only:** the Edge Function runtime container couldn't fetch npm packages through this environment's TLS-intercepting proxy. I rebuilt the image locally with the proxy's certificate trusted, under the same tag; nothing in the repo depends on this. The README documents `DENO_CERT` for anyone behind a similar proxy.
- **No iOS or Android simulator here.** Please check these on a dev build:
  - camera scan;
  - Photos → PDF, including HEIC;
  - a large PDF upload over cellular with airplane mode toggled mid-upload;
  - the share sheet on iOS and Android, and Android "Save to device";
  - profile photo crop and upload.
- **Rebuild needed:** this phase adds native modules (scanner, image picker and manipulator, document picker, sharing, file system), so **build a new development client** before testing.
- **Phase 3:** nothing blocks it. The fixture set already includes the geometry cases its positioning tests will reuse.
