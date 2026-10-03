import { EncryptedPDFError, PDFDocument } from '../deps.ts';
import { HttpError } from '../http.ts';

export interface PageGeometry {
  page_number: number;
  /** Visible box (CropBox ∩ MediaBox) as displayed, after /Rotate. */
  width_pt: number;
  height_pt: number;
  /** Lower-left of the visible box in unrotated user space. */
  box_x_pt: number;
  box_y_pt: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface PdfInfo {
  pageCount: number;
  pages: PageGeometry[];
}

const HEADER = new TextEncoder().encode('%PDF-');

/** The PDF header may be preceded by up to 1024 bytes of junk (ISO 32000-1 §7.5.2 / reader practice). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - HEADER.length, 1024);
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < HEADER.length; j++) if (bytes[i + j] !== HEADER[j]) continue outer;
    return true;
  }
  return false;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function normalizeRotation(angle: number): PageGeometry['rotation'] {
  const r = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return r as PageGeometry['rotation'];
}

/** Validates a PDF and extracts per-page geometry following the SPEC §8.1 visible-box convention. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  if (!hasPdfHeader(bytes)) throw new HttpError('FILE_UNSUPPORTED', 422, 'Not a PDF file');

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  } catch (error) {
    // pdf-lib's transpiled error classes do not survive `instanceof`, so also match the message.
    if (error instanceof EncryptedPDFError || /is encrypted/i.test(String((error as Error)?.message))) {
      throw new HttpError('FILE_UNSUPPORTED', 422, 'Password-protected PDFs are not supported');
    }
    throw new HttpError('PDF_RENDER_FAILED', 422, 'The PDF could not be read');
  }

  let pages;
  try {
    pages = doc.getPages();
  } catch {
    throw new HttpError('PDF_RENDER_FAILED', 422, 'The PDF page tree could not be read');
  }
  if (pages.length === 0) throw new HttpError('PDF_RENDER_FAILED', 422, 'The PDF has no pages');

  const geometry = pages.map((page, index): PageGeometry => {
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const x0 = Math.max(media.x, crop.x);
    const y0 = Math.max(media.y, crop.y);
    const x1 = Math.min(media.x + media.width, crop.x + crop.width);
    const y1 = Math.min(media.y + media.height, crop.y + crop.height);
    // A CropBox outside the MediaBox is invalid; readers fall back to the MediaBox.
    const [vx, vy, vw, vh] =
      x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : [media.x, media.y, media.width, media.height];
    const rotation = normalizeRotation(page.getRotation().angle);
    const swap = rotation === 90 || rotation === 270;
    return {
      page_number: index + 1,
      width_pt: round(swap ? vh : vw),
      height_pt: round(swap ? vw : vh),
      box_x_pt: round(vx),
      box_y_pt: round(vy),
      rotation,
    };
  });

  if (geometry.some((g) => !(g.width_pt > 0 && g.height_pt > 0))) {
    throw new HttpError('PDF_RENDER_FAILED', 422, 'The PDF has a page with no size');
  }

  return { pageCount: geometry.length, pages: geometry };
}
