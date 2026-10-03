export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // WebCrypto requires an ArrayBuffer-backed view; pdf-lib returns ArrayBufferLike-typed arrays.
  const view =
    bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
