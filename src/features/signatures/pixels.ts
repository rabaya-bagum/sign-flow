/**
 * Pure signature image processing over RGBA buffers (SPEC §5.7). No Skia here, so it is unit-tested
 * directly; render.ts does the pixel I/O.
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
  /** Milliseconds; used for velocity-based stroke width. */
  t: number;
}

/** Output long edge (px) and size cap (bytes) for every signature PNG. */
export const OUTPUT_MIN_LONG_EDGE = 600;
export const OUTPUT_MAX_LONG_EDGE = 1200;
export const OUTPUT_MAX_BYTES = 500 * 1024;
/** Padding around the ink, as a fraction of the ink's long edge. */
export const PADDING_FRACTION = 0.04;

/** Bounding box of pixels with alpha ≥ minAlpha, or null when there is no ink. */
export function inkBounds(rgba: Uint8Array, width: number, height: number, minAlpha = 16): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3]! >= minAlpha) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Grows bounds by PADDING_FRACTION of their long edge on every side (may extend past the image). */
export function padBounds(bounds: Bounds, fraction = PADDING_FRACTION): Bounds {
  const pad = Math.max(1, Math.round(Math.max(bounds.width, bounds.height) * fraction));
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  };
}

/** Output size: the long edge scaled into [min, max], aspect ratio kept. */
export function outputSize(
  width: number,
  height: number,
  { min = OUTPUT_MIN_LONG_EDGE, max = OUTPUT_MAX_LONG_EDGE } = {},
): { width: number; height: number; scale: number } {
  const long = Math.max(width, height);
  const target = Math.min(max, Math.max(min, long));
  const scale = target / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Background removal for uploaded signatures: pixels darker than `threshold` become ink, lighter ones
 * transparent, with a soft ramp of `softness` levels so edges stay anti-aliased. Returns a new buffer.
 */
export function applyThreshold(rgba: Uint8Array, threshold: number, softness = 24): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const l = luminance(r, g, b);
    const coverage = l >= threshold ? 0 : l <= threshold - softness ? 1 : (threshold - l) / softness;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = Math.round(coverage * rgba[i + 3]!);
  }
  return out;
}

/** Otsu's split of luminance into ink and paper: a good starting point for the slider. */
export function suggestThreshold(rgba: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 16) continue;
    histogram[Math.round(luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!))]! += 1;
    total++;
  }
  if (total === 0) return 128;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * histogram[v]!;
  let sumBackground = 0;
  let weightBackground = 0;
  let best = -1;
  let midpoint = 128;
  for (let v = 0; v < 256; v++) {
    weightBackground += histogram[v]!;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += v * histogram[v]!;
    const meanB = sumBackground / weightBackground;
    const meanF = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      // Halfway between the ink and paper means: robust when the histogram has a flat gap.
      midpoint = (meanB + meanF) / 2;
    }
  }
  return Math.round(midpoint);
}

/** Total length and bounding box of drawn strokes, in canvas points. */
export function strokeStats(strokes: Point[][]): { length: number; bounds: Bounds | null } {
  let length = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i]!;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      if (i > 0) length += Math.hypot(p.x - stroke[i - 1]!.x, p.y - stroke[i - 1]!.y);
    }
  }
  return {
    length,
    bounds: maxX === -Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

/**
 * Rejects dots and tiny scribbles: the ink must span at least 15% of the canvas width (or 25% of its
 * height) and be drawn with at least 60% of the canvas width in total stroke length.
 */
export function isTrivialDrawing(strokes: Point[][], canvasWidth: number, canvasHeight: number): boolean {
  const { length, bounds } = strokeStats(strokes);
  if (!bounds) return true;
  const spansEnough = bounds.width >= canvasWidth * 0.15 || bounds.height >= canvasHeight * 0.25;
  return !spansEnough || length < canvasWidth * 0.6;
}

/** Stroke width for each segment: thinner when the pen moves fast (pen-on-paper feel). */
export function segmentWidths(stroke: Point[], baseWidth: number): number[] {
  const widths: number[] = [];
  let previous = baseWidth;
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1]!;
    const b = stroke[i]!;
    const dt = Math.max(1, b.t - a.t);
    const velocity = Math.hypot(b.x - a.x, b.y - a.y) / dt; // points per ms
    const target = baseWidth * Math.min(1.25, Math.max(0.45, 1.25 - velocity * 0.35));
    previous = previous * 0.6 + target * 0.4; // smooth width changes
    widths.push(previous);
  }
  return widths;
}

/** Initials from a full name: first letter of the first and last words, uppercase ("Aaliyah Fatimah" → "AF"). */
export function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return '';
  const first = Array.from(words[0]!)[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}

export interface StrokeShapes {
  /** Round dabs at each sample: x, y, radius. */
  dabs: { x: number; y: number; r: number }[];
  /** Quads joining consecutive dabs, all wound clockwise (y-down) so a winding fill never cancels. */
  quads: { x: number; y: number }[][];
}

/**
 * Geometry for one variable-width stroke, filled as a single path: a dab per sample plus the quad
 * between neighbouring dabs. The live canvas and the exported PNG both use this.
 */
export function strokeShapes(stroke: Point[], baseWidth: number): StrokeShapes {
  if (stroke.length === 0) return { dabs: [], quads: [] };
  const widths = segmentWidths(stroke, baseWidth);
  const radius = (i: number) => (i === 0 ? (widths[0] ?? baseWidth) : widths[i - 1]!) / 2;
  const dabs = stroke.map((p, i) => ({ x: p.x, y: p.y, r: radius(i) }));
  const quads: { x: number; y: number }[][] = [];
  for (let i = 1; i < stroke.length; i++) {
    const a = dabs[i - 1]!;
    const b = dabs[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    const quad = [
      { x: a.x + nx * a.r, y: a.y + ny * a.r },
      { x: b.x + nx * b.r, y: b.y + ny * b.r },
      { x: b.x - nx * b.r, y: b.y - ny * b.r },
      { x: a.x - nx * a.r, y: a.y - ny * a.r },
    ];
    if (signedArea(quad) < 0) quad.reverse();
    quads.push(quad);
  }
  return { dabs, quads };
}

/** Shoelace area; positive means clockwise on a y-down canvas. */
export function signedArea(points: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

/** Width and height from a PNG's IHDR chunk, or null if the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
