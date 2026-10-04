import type { Database } from '@/types/database';

export type SignatureKind = Database['public']['Enums']['signature_kind'];
export type SignatureMethod = Database['public']['Enums']['signature_method'];
export type SavedSignature = Database['public']['Tables']['saved_signatures']['Row'];

/** What SignatureSheet hands back (Phase 6 applies it to a field). */
export interface SignatureResult {
  /** Local PNG: a cache file on native, a blob URL on web. Never a remote URL. */
  pngUri: string;
  /** The same PNG in memory (signing submits it). */
  bytes: Uint8Array;
  width: number;
  height: number;
  method: SignatureMethod;
  /** Set when the signature was saved, or picked from the saved ones. */
  savedSignatureId?: string;
}

/** Aspect ratio of the drawing pad (SPEC §5.7): wide for signatures, squarer for initials. */
export const PAD_ASPECT: Record<SignatureKind, number> = { signature: 3, initials: 1.5 };

/** Server-side limit per kind (saved_signatures trigger). */
export const MAX_SAVED_PER_KIND = 5;
