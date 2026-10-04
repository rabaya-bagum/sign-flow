/**
 * @jest-environment ./jest/skiaEnvironment.js
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Skia } from '@shopify/react-native-skia';

import { inkBounds, OUTPUT_MAX_BYTES, type Point } from '../pixels';
import {
  finalizeSignature,
  imageFromRgba,
  INK_COLORS,
  loadImage,
  loadTypeface,
  rasterizeStrokes,
  rasterizeText,
  readRgba,
} from '../render';

jest.mock('@shopify/react-native-skia', () =>
  jest.requireActual('@shopify/react-native-skia/lib/commonjs/mock').Mock(global.CanvasKit),
);

const fonts = join(__dirname, '../../../../assets/fonts');

function decode(png: Uint8Array) {
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(png))!;
  return { image, rgba: readRgba(image) };
}

function wave(width: number, height: number): Point[] {
  return Array.from({ length: 80 }, (_, i) => ({
    x: 20 + (i / 79) * (width - 40),
    y: height / 2 + Math.sin(i / 6) * height * 0.25,
    t: i * 12,
  }));
}

describe('signature rendering (CanvasKit)', () => {
  it('turns strokes into a trimmed, padded, transparent PNG within the size limits', () => {
    const image = rasterizeStrokes([wave(330, 110)], 330, 110, INK_COLORS.black);
    const png = finalizeSignature(image);
    expect(Math.max(png.width, png.height)).toBeGreaterThanOrEqual(600);
    expect(Math.max(png.width, png.height)).toBeLessThanOrEqual(1200);
    expect(png.bytes.length).toBeLessThanOrEqual(OUTPUT_MAX_BYTES);
    expect(Array.from(png.bytes.slice(1, 4), (c) => String.fromCharCode(c)).join('')).toBe('PNG');

    const { image: decoded, rgba } = decode(png.bytes);
    expect(decoded.width()).toBe(png.width);
    expect(rgba[3]).toBe(0); // transparent corner
    // Ink touches the padding boundary: ~4% of the long edge on each side.
    const ink = inkBounds(rgba, png.width, png.height)!;
    const pad = Math.max(png.width, png.height) * 0.04;
    expect(ink.x).toBeGreaterThan(pad * 0.5);
    expect(ink.x).toBeLessThan(pad * 1.6);
    expect(png.width - (ink.x + ink.width)).toBeLessThan(pad * 1.6);
  });

  it('keeps the ink colour', () => {
    const png = finalizeSignature(
      rasterizeStrokes([wave(330, 110)], 330, 110, INK_COLORS.blue, { baseWidth: 6 }),
    );
    const { rgba } = decode(png.bytes);
    let best = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]! > rgba[best + 3]!) best = i;
    expect(Array.from(rgba.slice(best, best + 3))).toEqual([0x1a, 0x3a, 0x8f]);
  });

  it.each(['DancingScript-SemiBold.ttf', 'GreatVibes-Regular.ttf', 'Caveat-Medium.ttf'])(
    'renders typed text with %s',
    async (file) => {
      const typeface = await loadTypeface(new Uint8Array(readFileSync(join(fonts, file))));
      const png = finalizeSignature(rasterizeText('Aaliyah Fatimah', typeface, INK_COLORS.black));
      expect(png.width).toBeGreaterThan(png.height * 2); // a name is wide
      expect(png.width).toBeLessThanOrEqual(1200);
      expect(png.bytes.length).toBeLessThanOrEqual(OUTPUT_MAX_BYTES);
    },
  );

  it('rejects an empty canvas', () => {
    expect(() => finalizeSignature(rasterizeStrokes([], 300, 100, INK_COLORS.black))).toThrow(
      expect.objectContaining({ code: 'SIGNATURE_TOO_SIMPLE' }),
    );
  });

  it('scales noisy, detailed images down to stay under 500 KB', async () => {
    // Random coloured noise compresses badly: the worst case for PNG size.
    const size = 1200;
    const rgba = new Uint8Array(size * size * 4);
    let seed = 1;
    for (let i = 0; i < rgba.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      rgba[i] = i % 4 === 3 ? 255 : seed & 0xff;
    }
    const png = finalizeSignature(imageFromRgba(rgba, size, size));
    expect(png.bytes.length).toBeLessThanOrEqual(OUTPUT_MAX_BYTES);
    expect(png.width).toBeLessThan(1200);
    // Round trip through the decoder used for uploads.
    const reloaded = await loadImage(png.bytes);
    expect(reloaded.width()).toBe(png.width);
  });
});
