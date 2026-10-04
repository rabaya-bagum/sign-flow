import { PDFDocument } from '../deps.ts';
import { HttpError } from '../http.ts';

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const MARGIN = 24;

export type ImageKind = 'jpeg' | 'png';

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

/**
 * One A4 page per image, orientation matching the image, image fitted inside a 24 pt margin and
 * centered (SPEC §5.3, Phase 2 prompt §B).
 */
export async function imagesToPdf(images: Uint8Array[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const bytes of images) {
    const kind = detectImageKind(bytes);
    if (!kind) throw new HttpError('FILE_UNSUPPORTED', 422, 'Images must be JPEG or PNG');
    let image;
    try {
      image = kind === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    } catch {
      throw new HttpError('FILE_UNSUPPORTED', 422, 'An image could not be read');
    }
    const landscape = image.width > image.height;
    const [pw, ph] = landscape ? [A4_PORTRAIT[1], A4_PORTRAIT[0]] : A4_PORTRAIT;
    const scale = Math.min((pw - 2 * MARGIN) / image.width, (ph - 2 * MARGIN) / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const page = doc.addPage([pw, ph]);
    page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return doc.save();
}
