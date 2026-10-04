import { Asset } from 'expo-asset';

import { AppError } from '@shared/errors';

import { fontByKey } from './fonts';
import { applyThreshold, isTrivialDrawing, suggestThreshold, type Point } from './pixels';
import {
  downscale,
  finalizeSignature,
  imageFromRgba,
  INK_COLORS,
  loadImage,
  loadTypeface,
  rasterizeStrokes,
  rasterizeText,
  readRgba,
  type InkColor,
  type SignaturePng,
} from './render';

/**
 * Skia-backed producers for SignatureSheet. Imported lazily (see loadProducers) so that on web the
 * Skia module is evaluated only after CanvasKit has loaded.
 */

export interface DrawInput {
  method: 'drawn';
  strokes: Point[][];
  width: number;
  height: number;
  ink: InkColor;
}
export interface TypeInput {
  method: 'typed';
  text: string;
  fontKey: string;
  ink: InkColor;
}
export interface UploadInput {
  method: 'uploaded';
  uri: string;
  threshold: number;
}
export type ProduceInput = DrawInput | TypeInput | UploadInput;

/** Uploads are processed at this long edge (enough for a 1200 px output, fast to threshold). */
const UPLOAD_WORK_EDGE = 1600;
const PREVIEW_EDGE = 480;

async function fontUri(key: string): Promise<string> {
  const asset = Asset.fromModule(fontByKey(key).asset);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

export async function produceSignature(input: ProduceInput): Promise<SignaturePng> {
  switch (input.method) {
    case 'drawn':
      if (isTrivialDrawing(input.strokes, input.width, input.height))
        throw new AppError('SIGNATURE_TOO_SIMPLE');
      return finalizeSignature(
        rasterizeStrokes(input.strokes, input.width, input.height, INK_COLORS[input.ink]),
      );
    case 'typed': {
      const text = input.text.trim();
      if (!text) throw new AppError('INVALID_INPUT');
      const typeface = await loadTypeface(await fontUri(input.fontKey));
      return finalizeSignature(rasterizeText(text, typeface, INK_COLORS[input.ink]));
    }
    case 'uploaded': {
      const image = downscale(await loadImage(input.uri), UPLOAD_WORK_EDGE);
      const rgba = applyThreshold(readRgba(image), input.threshold);
      return finalizeSignature(imageFromRgba(rgba, image.width(), image.height()));
    }
  }
}

export interface UploadPreview {
  /** PNG data URL of the thresholded image (shown over a checkerboard). */
  uri: string;
  width: number;
  height: number;
}

/** Decodes an upload once, for fast previews while the threshold slider moves. */
export async function prepareUpload(uri: string) {
  const image = downscale(await loadImage(uri), PREVIEW_EDGE);
  const rgba = readRgba(image);
  const width = image.width();
  const height = image.height();
  return {
    suggestedThreshold: suggestThreshold(rgba),
    preview(threshold: number): UploadPreview {
      const out = imageFromRgba(applyThreshold(rgba, threshold), width, height);
      return { uri: `data:image/png;base64,${out.encodeToBase64()}`, width, height };
    },
  };
}
