import * as Crypto from 'expo-crypto';

/**
 * Signature PNGs that only live on this device: unsaved signatures and in-memory copies of saved ones
 * (SPEC §5.7). Native: the app's cache directory (sandboxed, never shared). Cleared on sign-out.
 */
const FOLDER = 'signatures';

export async function writeSignaturePng(bytes: Uint8Array): Promise<string> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const dir = new Directory(Paths.cache, FOLDER);
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${Crypto.randomUUID()}.png`);
  file.create();
  file.write(bytes);
  return file.uri;
}

export async function clearSignatureFiles(): Promise<void> {
  const { Directory, Paths } = await import('expo-file-system');
  const dir = new Directory(Paths.cache, FOLDER);
  if (dir.exists) dir.delete();
}
