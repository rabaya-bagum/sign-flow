/** Web: unsaved signatures are in-memory blob URLs, revoked on sign-out (see localFiles.ts). */
const urls = new Set<string>();

export async function writeSignaturePng(bytes: Uint8Array): Promise<string> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  urls.add(url);
  return url;
}

export async function clearSignatureFiles(): Promise<void> {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}
