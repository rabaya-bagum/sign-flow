import { ESIGN_DISCLOSURE_VERSION } from '@shared/legal';
import type { SigningSession, SubmitSigningResult } from '@shared/signing';

import type { DownloadKind } from '@/features/documents/api';
import { invokeFunction } from '@/lib/functions';

/** One submitted value; signature/initials reference an image in `assets`. */
export interface SubmissionValue {
  field_id: string;
  value?: string | null;
  asset?: string | null;
}

export interface Submission {
  values: SubmissionValue[];
  /** Base64 PNGs keyed by id. */
  assets: Record<string, string>;
  timezone: string | null;
}

/**
 * The signing screen talks to one of two backends with the same shape: the signed-in recipient
 * (signing-session, esign-consent, submit-signing, decline) or a guest link token (guest-*).
 */
export interface SigningClient {
  readonly mode: 'account' | 'guest';
  /** Stable query key part. */
  readonly key: string;
  open(): Promise<SigningSession>;
  consent(): Promise<void>;
  submit(submission: Submission): Promise<SubmitSigningResult>;
  decline(reason: string): Promise<void>;
  download(kind: DownloadKind): Promise<{ url: string; file_name: string }>;
}

export function accountSigningClient(documentId: string): SigningClient {
  return {
    mode: 'account',
    key: documentId,
    open: () => invokeFunction('signing-session', { document_id: documentId }),
    consent: () =>
      invokeFunction('esign-consent', {
        document_id: documentId,
        disclosure_version: ESIGN_DISCLOSURE_VERSION,
      }),
    submit: (s) => invokeFunction('submit-signing', { document_id: documentId, ...s }),
    decline: (reason) => invokeFunction('decline', { document_id: documentId, reason }),
    download: (kind) =>
      invokeFunction('get-download-url', { document_id: documentId, kind, purpose: 'download' }),
  };
}

export function guestSigningClient(token: string): SigningClient {
  return {
    mode: 'guest',
    key: token,
    open: () => invokeFunction('guest-open', { token }),
    consent: () => invokeFunction('guest-consent', { token, disclosure_version: ESIGN_DISCLOSURE_VERSION }),
    submit: (s) => invokeFunction('guest-submit', { token, ...s }),
    decline: (reason) => invokeFunction('guest-decline', { token, reason }),
    download: (kind) => invokeFunction('guest-download', { token, kind }),
  };
}

export function requestOtp(token: string): Promise<{ ok: true }> {
  return invokeFunction('guest-otp', { token, action: 'request' });
}

export function verifyOtp(token: string, code: string): Promise<{ ok: true }> {
  return invokeFunction('guest-otp', { token, action: 'verify', code });
}

/** Guest download with a token from a finished submission (the signing link is revoked by then). */
export function downloadWithToken(token: string, kind: DownloadKind) {
  return invokeFunction<{ url: string; file_name: string }>('guest-download', { token, kind });
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of raw bytes, without relying on btoa (not on every RN runtime). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '=';
  }
  return out;
}

/** The device's IANA time zone, for date_signed fields. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
