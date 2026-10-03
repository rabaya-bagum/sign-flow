# Phase 3 prompt — PDF viewer & signature creation

> Paste everything below the line into your coding agent. It assumes Phases 1–2 are merged and `SPEC.md`
> is current.

---

You are continuing work on **SignFlow**. The product and technical specification is in **`SPEC.md`** at
the repo root and is the source of truth. Phases 1 (foundation) and 2 (upload & library) are complete.
Where this prompt and the spec disagree, follow this prompt for Phase 3 scope and tell me about the
conflict.

## Goal of Phase 3
1. **De-risk the core of the product.** Prove that a position chosen on screen lands in exactly the same
   place in the final PDF, on every kind of page, on iOS, Android, and web.
2. Ship a fast, reliable **PDF viewer**.
3. Ship **signature and initials creation** (draw / type / upload) with saved signatures.

Phase 4 (field editor) and Phase 6 (signing and flattening) are built directly on what you produce here,
so the renderer, the geometry module, and the flattening primitive must be **production code, not
throwaway spike code**.

## Working agreement. This phase has two stop points.
1. **Read first.** Read `SPEC.md` (especially §2 PDF rows, §5.4, §5.7, §5.10, §8 `document_pages`, §8.1,
   §9, §10, §15, §16, §19) and the codebase, including the Phase 2 report, `process-upload`, and the PDF
   fixtures. Note any drift from the spec.
2. **STOP 1: plan.** Before writing code, reply with:
   - renderer architecture (see §A), the bridge protocol, and how the same surface runs on native and web
   - geometry and flattening design (§B), and the golden-test strategy
   - signature pipeline design (§D): canvas library, PNG export, background removal, fonts, licensing
   - files to create or change, and migrations
   - library choices with versions
   - risks and anything in the spec you think is wrong

   **Then wait for my approval.**
3. **STOP 2: spike report.** Build §A–§C first. Then send me the spike report (§C) with numbers,
   screenshots, and a clear **go / no-go recommendation** for the renderer. **Wait for my decision before
   building §D–§G.**
4. Small, logical commits. **No silent fakes.** Anything stubbed is visibly labelled in the UI and listed
   in your report.
5. Don't build later phases: no field editor UI, no field placement persistence (`document_fields`), no
   recipients, sending, signing flow, `finalize-document`, or certificate.
6. Ask when the spec is ambiguous. Don't invent product behavior.

## In scope

### A. PDF surface (renderer)
The recommended approach, which the spike must confirm or reject with evidence:
- **One web-based "PDF surface"**: a self-contained TypeScript module built on `pdfjs-dist` and bundled
  (esbuild or similar) into a **single offline HTML/JS asset**. No CDN at runtime.
  - **Native:** loaded in `react-native-webview`.
  - **Web** (needed for guest signing in Phase 6): the same module mounted directly or in an iframe.
- A **typed message bridge** in `/shared/pdfBridge.ts`, with versioned message types and Zod-validated on
  both ends. It covers commands (load, goToPage, setZoom, setOverlays, highlight) and events (loaded with
  page geometry, pageChanged, zoomChanged, tap with page + fractional coordinates, error).
- **Overlays are rendered inside the surface** (DOM positioned in page-fraction units), so fields scroll
  and zoom perfectly with the page. Phase 4 adds drag and resize on top of this. In Phase 3, overlays are
  display-only rectangles and images.
- **PDF loading.** Pick the most robust option and justify it in the plan: the surface fetches the
  short-lived signed URL directly (verify CORS from the WebView origin), or the app downloads to the
  cache with `expo-file-system` and the WebView reads the local file (configure file-access settings
  per platform). **Never** pass large PDFs as base64 over the bridge.
- **Performance requirements:**
  - Vertical continuous scroll with **virtualized** page rendering (visible pages ±1).
  - Per-canvas pixel budget capped by device memory (size by devicePixelRatio, clamped).
  - Pinch zoom from fit-width to 4×. CSS transform during the gesture, re-render on settle.
  - Double-tap to zoom.
  - Run pdf.js in a worker if the platform allows it; otherwise document the fallback.
- **Geometry** reported per page must use the same visible-box convention as SPEC §8.1 (CropBox ∩
  MediaBox, displayed rotation).
- Errors map to `PDF_RENDER_FAILED` (SPEC §15), with retry.

**Fallback options** if the spike shows pdf.js-in-WebView is not viable: `react-native-pdf` with native
overlays, or server-rasterized page images. Evaluate only if needed, and present them in the spike report.

### B. Geometry module & flattening primitive
- **`/shared/geometry.ts`**: pure, dependency-free functions. Displayed fractional rect ↔ PDF user-space
  rect for a page described by `{ width_pt, height_pt, box_x_pt, box_y_pt, rotation }`. It handles rotation
  0/90/180/270 and offset boxes, and clamps rects to the page.
  - Unit tests, plus property-based round-trip tests (`fast-check`): fraction → PDF → fraction is
    identity within 1e-6.
- **Fix `process-upload` if needed.** If Phase 2 extracted page size from the MediaBox only, or ignored the
  box origin, add the `box_x_pt`/`box_y_pt` columns (migration) and correct the extraction to the SPEC §8.1
  visible box. Write a one-off backfill that re-processes page metadata for existing documents from their
  stored originals. Report what changed.
- **`supabase/functions/_shared/pdf/stamp.ts`**: the flattening primitive Phase 6 will reuse.
  `stampRect(pdfDoc, pageIndex, fractionalRect, page, style)` and `stampImage(pdfDoc, pageIndex,
  fractionalRect, page, pngBytes)`, built on `pdf-lib` and `/shared/geometry.ts`.
  - Images are drawn upright **as the page is displayed**, including on rotated pages.
  - Aspect ratio is preserved and the image centered within the rect.

### C. Coordinate spike (gate for the rest of the phase)
- **Fixtures.** Extend the Phase 2 set to: portrait Letter, landscape A4, rotation 90/180/270, mixed sizes
  in one file, tiny (A6) and huge (A0) pages, an **offset CropBox**, and a **non-zero MediaBox origin**.
  Add a 200-page / ~25 MB performance fixture, generated at test time and not committed.
- **Golden test 1, math vs reference.** For every fixture page and a grid of points, the PDF point from
  pdf.js `viewport.convertToPdfPoint` (with the page's rotation) must equal `/shared/geometry.ts`'s result
  within **±1 pt**. Run it in Node/Deno with `pdfjs-dist`.
- **Golden test 2, raster.** Stamp known fractional rects with `stamp.ts` (solid color), render the
  stamped page with pdf.js to a bitmap, detect the colored region's bounding box, and assert it matches the
  expected displayed rect within ±1 pt (scaled). Do this for every fixture page, and for `stampImage` with
  a test PNG that has an asymmetric marker, to prove it isn't drawn rotated or mirrored.
- **Device round trip.** A dev-only route `/dev/coordinate-spike`:
  1. Open a fixture.
  2. Tap anywhere, at any zoom, to place boxes.
  3. Press **Stamp**. This calls a **dev-only** Edge Function `dev-stamp` that uses `stamp.ts` and
     returns the PDF. The function is enabled only when `DEV_TOOLS=true`, must refuse otherwise, and is
     excluded from production deploy config.
  4. Show the result side-by-side in the viewer.

  Run it on iOS simulator, Android emulator (or a device), and web.
- **Spike report (STOP 2):**
  - renderer decision with evidence
  - both golden test results
  - screenshots of the device round trip on all three platforms (portrait, rotated, offset-CropBox
    pages)
  - performance on the 200-page fixture, on iOS and Android: time to first page, memory after scrolling
    through all pages, subjective scroll smoothness, and zoom re-render time
  - known limitations
  - your go / no-go recommendation

### D. Signature creation (SPEC §5.7)
- **Migration.** Add the `saved_signatures` table and `signature_kind` / `signature_method` enums per
  SPEC §8 (if not already present).
  - Partial unique index for one default per kind: `(user_id, kind) where is_default`.
  - A `set_default_signature(id)` RPC that swaps the default in one transaction.
  - A limit of 5 saved signatures per kind, enforced server-side.
  - `signatures` bucket (private, PNG only, ≤ 1 MB) with owner-only policies on `{user_id}/`.
  - RLS per SPEC §14.
- **Reusable `SignatureSheet`** (bottom sheet), with props `kind`, `defaultName`, and
  `onComplete({ pngUri, width, height, method, savedSignatureId? })`. Phase 6 will open it from signature
  fields. Tabs:
  - **Draw.** Skia-based canvas (`@shopify/react-native-skia`) preferred over WebView canvases. Smooth
    strokes with pressure/velocity width if feasible. Clear, Undo (per stroke), Save. Ink black by
    default, dark blue optional.
    - The canvas is a light "paper" surface **in both themes**, so the ink color is true.
    - Reject trivial input (bounding box or total stroke length below a threshold) with a friendly
      message.
    - Signature aspect ≈ 3:1, initials ≈ 1.5:1. Landscape orientation is supported on phones for drawing
      comfort.
  - **Type.** Text input prefilled with the user's name (initials derived for `kind = initials`), plus
    3 bundled script fonts under the **SIL Open Font License** (e.g. from Google Fonts). Commit the
    license files and list the fonts in the README. Render to PNG offscreen. Store `typed_text` and
    `font_key`.
  - **Upload.** Image picker or camera, then crop. Convert to a transparent PNG with an adjustable
    luminance threshold slider and a preview on a checkerboard background. Auto-trim. Input ≤ 10 MB.
- **Output normalization** (all methods): transparent PNG, trimmed to the ink bounding box plus 4%
  padding, with a long edge of 600–1200 px. Output must be ≤ 500 KB; down-scale if larger.
- **"Save for future use"** checkbox, on by default only for the first signature. It uploads to
  `signatures/{user_id}/{id}.png` and inserts `saved_signatures`. Unsaved signatures exist only in the
  app's cache.
- **Picker of saved signatures** at the top of the sheet when any exist ("Use saved" vs "Create new").
- **Accessibility.** The **Type** tab is the accessible path and fully operable with VoiceOver/TalkBack.
  The Draw canvas has a label and hint pointing to Type.

### E. Account → Signatures (SPEC §5.10)
- List saved signatures and initials (rendered via short-lived signed URLs, cached in memory only).
- Add (opens `SignatureSheet`), set default, delete with confirmation.
- Empty state: "Save a signature to sign faster."

### F. Viewer screens (SPEC §5.4)
- **`documents/[id]/view.tsx`**, built on the PDF surface:
  - page indicator ("3 / 12")
  - page jump (thumbnail strip or a sheet with page numbers; thumbnails are rendered lazily)
  - zoom controls in addition to pinch
  - Download/Share (reuse Phase 2)
- Replace the Phase 2 "Preview" placeholder in document details with a first-page preview card that opens
  the viewer.
- **`get-download-url`:** add `purpose: 'view' | 'download'` per SPEC §10.
  - `view` logs `DOCUMENT_VIEWED`, de-duplicated to one per user per document per 30 minutes, and **never**
    changes recipient status.
  - `download` keeps Phase 2 behavior.
- **Local PDF cache** (if you chose the download-to-cache approach): store files in the app's cache
  directory, keyed by document id + `original_sha256`, with an LRU cap of 200 MB. **Cleared on logout and
  on account switch.** Never stored in a shared or public location.
- **Accessibility:**
  - Each page is exposed as "Page n of N".
  - Screen-reader users can open the document via the system share sheet.
  - A pdf.js text layer for screen readers is a **stretch goal**. Report whether it was done.

### G. Security & cleanup
- Signature images and PDFs are never logged, never sent to analytics or crash reporting, and never
  persisted outside the app sandbox.
- The WebView is locked down:
  - no navigation outside the bundled asset (`onShouldStartLoadWithRequest`)
  - `originWhitelist` restricted
  - JavaScript bridge messages validated
  - no `allowUniversalAccessFromFileURLs` unless strictly required, with a justification if so
- `dev-stamp` and `/dev/*` routes are unavailable in production builds. Add a test or build check that
  proves it.

## Out of scope for Phase 3
Field editor and `document_fields`, draggable or resizable overlays, recipients, sending, signing flow,
applying signatures to documents, `finalize-document`, certificate, push, Activity tab, biometric
protection of saved signatures (Phase 8).

## Acceptance criteria. All must be demonstrably true.
1. `typecheck`, `lint`, Jest, pgTAP, and Deno tests all pass. `supabase db reset` works from scratch.
2. **Golden tests 1 and 2 pass for every fixture page**, including rotation 90/180/270, offset CropBox,
   and non-zero MediaBox origin, within ±1 pt. `stampImage` output is upright and not mirrored on rotated
   pages.
3. The device round trip works on iOS, Android, and web, and screenshots are in the spike report.
   Positions match visually on every fixture.
4. `document_pages` uses the SPEC §8.1 visible-box convention for all existing and new documents
   (backfill run and verified).
5. The viewer opens the 200-page / 25 MB fixture and shows the first page within the budget agreed at
   STOP 2. It scrolls through all pages without crashing on a mid-range Android emulator/device and the
   iOS simulator, and memory stays bounded (numbers in the report).
6. A user can draw, type, and upload both a signature and initials. Each produces a trimmed transparent
   PNG within the size limits. Saved ones appear in Account → Signatures and can be set as default and
   deleted.
7. **pgTAP tests prove:**
   - user B cannot read, update, or delete user A's `saved_signatures` rows or `signatures/` objects
   - only one default per kind is possible
   - the 6th saved signature of a kind is rejected
8. Opening the viewer logs `DOCUMENT_VIEWED` at most once per 30 minutes per user and document, and
   recipient status is unchanged. Downloading still logs `DOCUMENT_DOWNLOADED`.
9. The PDF cache is cleared on logout (test or manual evidence). WebView navigation outside the bundled
   asset is blocked (test).
10. `dev-stamp` refuses requests without `DEV_TOOLS=true`, and `/dev/*` routes are absent from
    production builds.
11. Light/dark mode, the largest font size, and screen-reader labels work on all new screens. The Type
    tab is fully usable with a screen reader.
12. README is updated: building the PDF surface asset, fonts and licenses, the `DEV_TOOLS` flag, and
    running golden tests. `.env.example` is current.

## Final phase report (required format)
1. **Summary:** what was built.
2. **Spike report:** the final version, including your STOP 2 decision and any follow-ups.
3. **File tree** of created/changed files.
4. **Migrations:** list with a one-line purpose each, including any backfill.
5. **Bridge protocol:** message types and versioning, for Phase 4.
6. **Test results:** command output summary for typecheck, lint, Jest, pgTAP, Deno, and the golden tests.
7. **Performance:** viewer metrics on iOS and Android.
8. **Acceptance criteria:** each item marked ✅ / ⚠️ / ❌ with evidence.
9. **Stubs & TODOs:** every placeholder and its target phase, plus which stretch goals were done.
10. **Spec issues:** anything in `SPEC.md` you found wrong, ambiguous, or risky, with a proposed fix.
11. **Next:** anything Phase 4 needs from me.

Start with step 1 of the working agreement: read the spec and codebase, then send me your plan and wait.
