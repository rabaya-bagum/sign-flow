import {
  AlphaType,
  BlendMode,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkImage,
  type SkTypeface,
} from '@shopify/react-native-skia';

import { AppError } from '@shared/errors';

import {
  inkBounds,
  OUTPUT_MAX_BYTES,
  OUTPUT_MAX_LONG_EDGE,
  OUTPUT_MIN_LONG_EDGE,
  outputSize,
  padBounds,
  segmentWidths,
  type Point,
} from './pixels';

/**
 * Skia pixel I/O for signatures: rasterize strokes or text, read pixels, trim, scale and encode a
 * transparent PNG (SPEC §5.7). Works on native, on web (after CanvasKit loads) and in Jest (CanvasKit).
 */

export interface SignaturePng {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Ink colours offered when drawing or typing. Black is the default. */
export const INK_COLORS = { black: '#111111', blue: '#1A3A8F' } as const;
export type InkColor = keyof typeof INK_COLORS;

function rgbaInfo(width: number, height: number) {
  return { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
}

function offscreen(width: number, height: number) {
  const surface = Skia.Surface.MakeOffscreen(Math.ceil(width), Math.ceil(height));
  if (!surface) throw new Error('Could not create an offscreen surface');
  surface.getCanvas().clear(Skia.Color('transparent'));
  return surface;
}

function snapshot(surface: ReturnType<typeof offscreen>): SkImage {
  surface.flush();
  const image = surface.makeImageSnapshot();
  return image.makeNonTextureImage() ?? image;
}

export function readRgba(image: SkImage): Uint8Array {
  const pixels = image.readPixels(0, 0, rgbaInfo(image.width(), image.height()));
  if (!(pixels instanceof Uint8Array)) throw new Error('Could not read pixels');
  return pixels;
}

export function imageFromRgba(rgba: Uint8Array, width: number, height: number): SkImage {
  const image = Skia.Image.MakeImage(rgbaInfo(width, height), Skia.Data.fromBytes(rgba), width * 4);
  if (!image) throw new Error('Could not create image');
  return image;
}

/** Rasterizes strokes drawn on a canvas of `width` × `height` points at `scale` px per point. */
export function rasterizeStrokes(
  strokes: Point[][],
  width: number,
  height: number,
  color: string,
  { scale = 3, baseWidth = 3 } = {},
): SkImage {
  const surface = offscreen(width * scale, height * scale);
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      const dot = Skia.Paint();
      dot.setAntiAlias(true);
      dot.setColor(Skia.Color(color));
      canvas.drawCircle(stroke[0]!.x, stroke[0]!.y, baseWidth / 2, dot);
      continue;
    }
    const widths = segmentWidths(stroke, baseWidth);
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1]!;
      const b = stroke[i]!;
      paint.setStrokeWidth(widths[i - 1]!);
      canvas.drawLine(a.x, a.y, b.x, b.y, paint);
    }
  }
  return snapshot(surface);
}

/** Rasterizes typed text in a script font, large enough to trim and scale down cleanly. */
export function rasterizeText(text: string, typeface: SkTypeface, color: string, size = 220): SkImage {
  const font = Skia.Font(typeface, size);
  // Advance widths (measureText is not implemented on web). Script glyphs overhang their advance,
  // so leave a generous margin; trimming removes it afterwards.
  const advance = font.getGlyphWidths(font.getGlyphIDs(text)).reduce((sum, w) => sum + w, 0);
  const margin = size * 0.5;
  const width = Math.min(8000, Math.max(1, advance) + margin * 2);
  const surface = offscreen(width, size * 2);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  surface.getCanvas().drawText(text, margin, size * 1.3, paint, font);
  return snapshot(surface);
}

/** Loads a font file (asset URI or bytes) as a Skia typeface. */
export async function loadTypeface(source: string | Uint8Array): Promise<SkTypeface> {
  const data = typeof source === 'string' ? await Skia.Data.fromURI(source) : Skia.Data.fromBytes(source);
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
  if (!typeface) throw new Error('Could not load font');
  return typeface;
}

/** Decodes an encoded image (PNG/JPEG bytes or URI). */
export async function loadImage(source: string | Uint8Array): Promise<SkImage> {
  const data = typeof source === 'string' ? await Skia.Data.fromURI(source) : Skia.Data.fromBytes(source);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new AppError('FILE_UNSUPPORTED');
  return image;
}

/** Scales an image down so its long edge is at most `maxEdge` (for fast threshold previews). */
export function downscale(image: SkImage, maxEdge: number): SkImage {
  const long = Math.max(image.width(), image.height());
  if (long <= maxEdge) return image;
  const scale = maxEdge / long;
  const width = Math.max(1, Math.round(image.width() * scale));
  const height = Math.max(1, Math.round(image.height() * scale));
  const surface = offscreen(width, height);
  surface
    .getCanvas()
    .drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, width, height),
      FilterMode.Linear,
      MipmapMode.Linear,
    );
  return snapshot(surface);
}

/**
 * Trims to the ink plus 4% padding, scales the long edge into 600–1200 px and encodes a PNG of at most
 * 500 KB (scaling down further if needed). Throws SIGNATURE_TOO_SIMPLE when there is no ink.
 */
export function finalizeSignature(image: SkImage): SignaturePng {
  const rgba = readRgba(image);
  const ink = inkBounds(rgba, image.width(), image.height());
  if (!ink) throw new AppError('SIGNATURE_TOO_SIMPLE');
  const crop = padBounds(ink);
  let { width, height } = outputSize(crop.width, crop.height, {
    min: OUTPUT_MIN_LONG_EDGE,
    max: OUTPUT_MAX_LONG_EDGE,
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const surface = offscreen(width, height);
    const paint = Skia.Paint();
    paint.setBlendMode(BlendMode.Src);
    surface
      .getCanvas()
      .drawImageRectOptions(
        image,
        Skia.XYWHRect(crop.x, crop.y, crop.width, crop.height),
        Skia.XYWHRect(0, 0, width, height),
        FilterMode.Linear,
        MipmapMode.Linear,
        paint,
      );
    const bytes = snapshot(surface).encodeToBytes(ImageFormat.PNG, 100);
    if (bytes.length <= OUTPUT_MAX_BYTES) return { bytes, width, height };
    // Too large (very detailed uploads): shrink proportionally to the excess and try again.
    const factor = Math.max(0.5, Math.sqrt(OUTPUT_MAX_BYTES / bytes.length) * 0.95);
    width = Math.max(1, Math.round(width * factor));
    height = Math.max(1, Math.round(height * factor));
  }
  throw new AppError('FILE_TOO_LARGE');
}
