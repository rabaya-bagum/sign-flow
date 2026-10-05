// Pinned third-party imports for all Edge Functions (one place to bump versions).
export { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
export { z } from 'npm:zod@4.6.5';
export {
  degrees,
  EncryptedPDFError,
  PDFDocument,
  type PDFFont,
  type PDFImage,
  rgb,
  StandardFonts,
} from 'npm:pdf-lib@1.17.1';
