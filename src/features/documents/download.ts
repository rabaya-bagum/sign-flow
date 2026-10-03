import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

import { AppError } from '@shared/errors';

import { env } from '@/lib/env';

import { getDownloadUrl } from './api';

/**
 * Signed URLs are minted inside the Edge Function, whose Supabase URL can be an internal host
 * (locally `kong:8000`). Rebase them onto the URL this app uses. Avoids `URL` (partial in RN).
 */
export function toAppUrl(signedUrl: string, baseUrl: string = env.supabaseUrl): string {
  return signedUrl.replace(/^https?:\/\/[^/]+/i, baseUrl.replace(/\/+$/, ''));
}

async function downloadToCache(documentId: string) {
  const { url, file_name } = await getDownloadUrl(documentId);
  const { Directory, File, Paths } = await import('expo-file-system');
  const dir = new Directory(Paths.cache, 'downloads', Crypto.randomUUID());
  dir.create({ intermediates: true, idempotent: true });
  try {
    const file = await File.downloadFileAsync(toAppUrl(url), new File(dir, file_name));
    return { file, fileName: file_name, cleanup: () => dir.delete() };
  } catch (error) {
    dir.delete();
    throw new AppError('NETWORK_OFFLINE', undefined, { cause: error });
  }
}

/** Download → system share sheet (iOS "Save to Files" lives there) → delete the cached copy. */
export async function shareDocument(documentId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const { url } = await getDownloadUrl(documentId);
    await Linking.openURL(toAppUrl(url));
    return;
  }
  const { file, fileName, cleanup } = await downloadToCache(documentId);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: fileName,
    });
  } finally {
    cleanup();
  }
}

export const canSaveToDevice = Platform.OS === 'android';

/** Android: let the user pick a folder (Storage Access Framework) and write the PDF there. */
export async function saveToDevice(documentId: string): Promise<boolean> {
  if (!canSaveToDevice) return false;
  const { Directory } = await import('expo-file-system');
  let target;
  try {
    target = await Directory.pickDirectoryAsync();
  } catch {
    return false; // user cancelled the folder picker
  }
  const { file, fileName, cleanup } = await downloadToCache(documentId);
  try {
    target.createFile(fileName, 'application/pdf').write(await file.bytes());
    return true;
  } finally {
    cleanup();
  }
}
