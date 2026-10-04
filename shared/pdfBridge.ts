import { z } from 'zod';

/**
 * Message protocol between the app and the PDF surface (web/pdf-surface), carried over
 * react-native-webview `postMessage` on native and `window.postMessage` to an iframe on web.
 * Both ends validate every message. Bump BRIDGE_VERSION on breaking changes.
 */
export const BRIDGE_VERSION = 1 as const;

const v = z.literal(BRIDGE_VERSION);
const fraction = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);

export const fractionalRectSchema = z.object({ x: fraction, y: fraction, width: fraction, height: fraction });

export const overlaySchema = z.object({
  id: z.string().min(1).max(100),
  page: z.number().int().min(1),
  rect: fractionalRectSchema,
  kind: z.enum(['rect', 'image']),
  /** Border colour (rect). */
  color: hexColor.optional(),
  /** Fill colour, may include alpha (rect). */
  fill: hexColor.optional(),
  /** PNG data URL (image). */
  src: z.string().startsWith('data:image/png;base64,').max(3_000_000).optional(),
  /** Accessible name. */
  label: z.string().max(200).optional(),
});

export const pageGeometrySchema = z.object({
  page: z.number().int().min(1),
  width_pt: z.number().positive(),
  height_pt: z.number().positive(),
  box_x_pt: z.number(),
  box_y_pt: z.number(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

export const surfaceCommandSchema = z.discriminatedUnion('type', [
  z.object({
    v,
    type: z.literal('load'),
    /** Short-lived signed URL (https, or http for local development). */
    url: z.string().regex(/^https?:\/\//).max(4096),
    background: hexColor,
    /** Accessible page label template, e.g. "Page {page} of {total}". */
    pageLabel: z.string().min(1).max(100),
  }),
  z.object({ v, type: z.literal('goToPage'), page: z.number().int().min(1) }),
  z.object({ v, type: z.literal('setZoom'), zoom: z.number().min(1).max(4) }),
  z.object({ v, type: z.literal('setOverlays'), overlays: z.array(overlaySchema).max(500) }),
  z.object({ v, type: z.literal('highlight'), id: z.string().max(100).nullable() }),
]);

export const surfaceEventSchema = z.discriminatedUnion('type', [
  z.object({ v, type: z.literal('ready') }),
  z.object({ v, type: z.literal('loaded'), pageCount: z.number().int().min(1), pages: z.array(pageGeometrySchema) }),
  z.object({ v, type: z.literal('pageChanged'), page: z.number().int().min(1), pageCount: z.number().int().min(1) }),
  z.object({ v, type: z.literal('zoomChanged'), zoom: z.number().min(1).max(4) }),
  z.object({ v, type: z.literal('tap'), page: z.number().int().min(1), x: fraction, y: fraction }),
  z.object({ v, type: z.literal('error'), code: z.enum(['PDF_RENDER_FAILED', 'NETWORK_OFFLINE']), message: z.string().max(500) }),
]);

export type SurfaceCommand = z.infer<typeof surfaceCommandSchema>;
export type SurfaceEvent = z.infer<typeof surfaceEventSchema>;
export type SurfaceOverlay = z.infer<typeof overlaySchema>;
export type PageGeometry = z.infer<typeof pageGeometrySchema>;

/** Parses a raw bridge message (JSON string); returns null for anything invalid. */
export function parseMessage<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== 'string' || raw.length > 4_000_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
