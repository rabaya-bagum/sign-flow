import { ensureSkia } from '@/lib/skia';

/** Loads Skia (CanvasKit on web) and then the Skia-backed signature producers. */
export async function loadProducers() {
  await ensureSkia();
  return import('./produce');
}

/** Same for the drawing pad component. */
export async function loadDrawPad() {
  await ensureSkia();
  return import('./DrawPad');
}
