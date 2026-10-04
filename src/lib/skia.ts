/** Native: Skia is linked into the app, nothing to load. See skia.web.ts. */
export function ensureSkia(): Promise<void> {
  return Promise.resolve();
}
