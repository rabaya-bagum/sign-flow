import { clearSignatureFiles } from '@/features/signatures/localFiles';

/**
 * Removes files this account left on the device (SPEC §16): unsaved signature PNGs and local copies
 * of saved ones. Documents are never stored locally (the viewer streams them), so there is no PDF cache.
 */
export async function clearLocalUserData(): Promise<void> {
  try {
    await clearSignatureFiles();
  } catch (error) {
    console.warn('clearing local files failed', error instanceof Error ? error.message : 'unknown');
  }
}
