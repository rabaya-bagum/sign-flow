import {
  fitAspect,
  fractionRectToPdfRect,
  fractionToPdfPoint,
  type FractionalRect,
  type PageBox,
} from '../../../../shared/geometry.ts';
import { degrees, type PDFDocument, type PDFFont, rgb } from '../deps.ts';

export interface RectStyle {
  /** RGB components 0..1. */
  color: [number, number, number];
  opacity?: number;
}

/**
 * Draws a filled rectangle at a displayed fractional rect (SPEC §8.1). Flattening primitive for
 * Phase 6; also used by the coordinate spike and golden tests.
 */
export function stampRect(
  doc: PDFDocument,
  pageIndex: number,
  rect: FractionalRect,
  page: PageBox,
  style: RectStyle,
) {
  const r = fractionRectToPdfRect(page, rect);
  doc.getPage(pageIndex).drawRectangle({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    color: rgb(...style.color),
    opacity: style.opacity ?? 1,
  });
}

/**
 * Draws a PNG inside a displayed fractional rect: aspect ratio preserved, centered, and upright as
 * the page is displayed — on rotated pages the image is counter-rotated by the page's /Rotate.
 */
export async function stampImage(
  doc: PDFDocument,
  pageIndex: number,
  rect: FractionalRect,
  page: PageBox,
  pngBytes: Uint8Array,
) {
  const image = await doc.embedPng(pngBytes);
  const fitted = fitAspect(page, rect, image.width / image.height);
  const r = fractionRectToPdfRect(page, fitted);
  const target = doc.getPage(pageIndex);
  // pdf-lib rotates counter-clockwise around (x, y); pick the anchor so the rotated image lands on r.
  switch (page.rotation) {
    case 0:
      target.drawImage(image, { x: r.x, y: r.y, width: r.width, height: r.height });
      break;
    case 90:
      target.drawImage(image, {
        x: r.x + r.width,
        y: r.y,
        width: r.height,
        height: r.width,
        rotate: degrees(90),
      });
      break;
    case 180:
      target.drawImage(image, {
        x: r.x + r.width,
        y: r.y + r.height,
        width: r.width,
        height: r.height,
        rotate: degrees(180),
      });
      break;
    case 270:
      target.drawImage(image, {
        x: r.x,
        y: r.y + r.height,
        width: r.height,
        height: r.width,
        rotate: degrees(270),
      });
      break;
  }
}

export type TextAlign = 'left' | 'center' | 'right';

/** Where to draw a line of text inside a displayed rect: PDF-space origin, rotation, and size. */
export interface TextPlacement {
  x: number;
  y: number;
  /** Degrees, counter-clockwise (pdf-lib), equal to the page's /Rotate so text reads upright. */
  rotate: number;
  size: number;
}

/**
 * Pure layout for stampText: fits the text into the rect (shrinking the font when needed),
 * vertically centred on the baseline, aligned horizontally, in displayed coordinates; then maps the
 * start of the baseline to PDF space.
 */
export function textPlacement(
  page: PageBox,
  rect: FractionalRect,
  widthAt: (size: number) => number,
  preferredSize: number,
  align: TextAlign,
): TextPlacement {
  const W = page.width_pt;
  const H = page.height_pt;
  const rw = rect.width * W;
  const rh = rect.height * H;
  const pad = Math.min(2, rw * 0.05);
  let size = Math.min(preferredSize, rh * 0.85);
  const width = widthAt(size);
  if (width > rw - 2 * pad && width > 0) size = Math.max(3, (size * (rw - 2 * pad)) / width);
  const textWidth = widthAt(size);
  const left =
    align === 'center'
      ? rect.x * W + (rw - textWidth) / 2
      : align === 'right'
        ? rect.x * W + rw - pad - textWidth
        : rect.x * W + pad;
  const baseline = rect.y * H + rh / 2 + size * 0.35;
  const origin = fractionToPdfPoint(page, { x: left / W, y: baseline / H });
  return { x: origin.x, y: origin.y, rotate: page.rotation, size };
}

/** Replaces characters the font cannot encode (standard fonts are WinAnsi only) with '?'. */
export function encodableText(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

/** Draws one line of text inside a displayed fractional rect, upright as the page is displayed. */
export function stampText(
  doc: PDFDocument,
  pageIndex: number,
  rect: FractionalRect,
  page: PageBox,
  text: string,
  options: { font: PDFFont; fontSize: number; align: TextAlign; color?: [number, number, number] },
) {
  const safe = encodableText(options.font, text);
  if (!safe) return;
  const at = textPlacement(
    page,
    rect,
    (size) => options.font.widthOfTextAtSize(safe, size),
    options.fontSize,
    options.align,
  );
  doc.getPage(pageIndex).drawText(safe, {
    x: at.x,
    y: at.y,
    size: at.size,
    font: options.font,
    rotate: degrees(at.rotate),
    color: rgb(...(options.color ?? [0.07, 0.09, 0.15])),
  });
}
