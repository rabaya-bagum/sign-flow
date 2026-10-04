export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // WebCrypto requires an ArrayBuffer-backed view; pdf-lib returns ArrayBufferLike-typed arrays.
  const view =
    bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base64 (standard alphabet) for attachments and data: URLs. Chunked to avoid call-stack limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Decodes standard or URL-safe base64; throws on invalid input. */
export function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64
    .replace(/^data:[^,]*,/, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
