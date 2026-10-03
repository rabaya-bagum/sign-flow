// Upload limits (SPEC §9). Shared by the app (client-side checks) and Edge Functions (enforcement).
// No imports: this file is loaded by both Metro and Deno.

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_CONVERSION = 30;
/** Uploads above this size use resumable (TUS) uploads; Supabase recommends TUS beyond 6 MB. */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
/** Long edge for photos before upload (resized on device). */
export const MAX_IMAGE_LONG_EDGE_PX = 2500;
export const MAX_TITLE_LENGTH = 200;
/** Signed download URLs expire after this many seconds (SPEC §9: ≤ 5 min). */
export const SIGNED_URL_TTL_SECONDS = 300;
