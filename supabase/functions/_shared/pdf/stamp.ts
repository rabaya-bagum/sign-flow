import {
  fitAspect,
  fractionRectToPdfRect,
  type FractionalRect,
  type PageBox,
} from '../../../../shared/geometry.ts';
import { degrees, type PDFDocument, rgb } from '../deps.ts';

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
