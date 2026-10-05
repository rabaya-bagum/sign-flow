import { sha256Hex } from './crypto.ts';
import type { SupabaseClient } from './deps.ts';

/** A random 256-bit token, base64url (SPEC §7). Only its SHA-256 hash is stored. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function hashToken(token: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(token));
}

/** Revokes the recipient's live tokens and issues a new one; returns the raw token (for the email). */
export async function issueToken(
  admin: SupabaseClient,
  recipientId: string,
  expiresAt: string,
): Promise<string> {
  const now = new Date().toISOString();
  const { error: revokeError } = await admin
    .from('recipient_access_tokens')
    .update({ revoked_at: now })
    .eq('recipient_id', recipientId)
    .is('revoked_at', null);
  if (revokeError) throw revokeError;
  return await insertToken(admin, recipientId, expiresAt, 'sign');
}

async function insertToken(
  admin: SupabaseClient,
  recipientId: string,
  expiresAt: string,
  purpose: 'sign' | 'download',
): Promise<string> {
  const token = newToken();
  const { error } = await admin.from('recipient_access_tokens').insert({
    recipient_id: recipientId,
    token_hash: await hashToken(token),
    expires_at: expiresAt,
    purpose,
  });
  if (error) throw error;
  return token;
}

/** A page of the web app; PUBLIC_SIGNING_URL is its origin. */
function publicUrl(path: string): string {
  const base = (Deno.env.get('PUBLIC_SIGNING_URL') ?? 'http://localhost:8081').replace(/\/+$/, '');
  return `${base}${path}`;
}

/** Public signing link (SPEC §4: /s/<token>). */
export function signingLink(token: string): string {
  return publicUrl(`/s/${token}`);
}

/** Days a completion download link works (SPEC §7: guests download the signed copy by link). */
export const DOWNLOAD_TOKEN_DAYS = 30;

/** Issues a download-only token (purpose 'download'), e.g. for the completion email. */
export function issueDownloadToken(admin: SupabaseClient, recipientId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_DAYS * 86_400_000).toISOString();
  return insertToken(admin, recipientId, expiresAt, 'download');
}

/** Web app page of a document, for people with an account (completion emails). */
export function documentLink(documentId: string): string {
  return publicUrl(`/documents/${documentId}`);
}
