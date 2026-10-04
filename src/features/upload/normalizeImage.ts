import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { MAX_IMAGE_LONG_EDGE_PX } from '@shared/limits';

export interface NormalizedImage {
  uri: string;
  width: number;
  height: number;
}

/** Long-edge target that keeps the aspect ratio, or null when no resize is needed. */
export function resizeTarget(width: number, height: number, maxEdge = MAX_IMAGE_LONG_EDGE_PX) {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/**
 * Converts any picked image (incl. HEIC) to JPEG and caps the long edge at 2500 px before upload
 * (SPEC §9: images ≤ 10 MB; the server accepts JPEG/PNG only).
 */
export async function normalizeImage(uri: string): Promise<NormalizedImage> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const target = resizeTarget(original.width, original.height);
  const ref = target ? await ImageManipulator.manipulate(uri).resize(target).renderAsync() : original;
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
