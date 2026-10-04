import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

let loading: Promise<void> | null = null;

/**
 * Web: loads CanvasKit (Skia in wasm, served from /canvaskit.wasm, copied by `npm install`). Modules
 * that import '@shopify/react-native-skia' must be imported dynamically after this resolves, because
 * the library binds to the global CanvasKit when it is first evaluated.
 */
export function ensureSkia(): Promise<void> {
  loading ??= LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
  return loading;
}
