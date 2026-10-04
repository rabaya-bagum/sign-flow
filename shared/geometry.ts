/**
 * Page geometry (SPEC §8.1). Pure functions with no imports: loaded by the app (Metro), the PDF
 * surface bundle (esbuild) and Edge Functions (Deno).
 *
 * Conventions
 * - A page is described as it is displayed: `width_pt`/`height_pt` are the visible box
 *   (CropBox ∩ MediaBox) after applying /Rotate; `box_x_pt`/`box_y_pt` are the lower-left corner of
 *   that box in unrotated PDF user space.
 * - Field positions are fractions (0..1) of the displayed page, origin TOP-LEFT.
 * - PDF user space has its origin bottom-left and is unrotated.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageBox {
  width_pt: number;
  height_pt: number;
  box_x_pt: number;
  box_y_pt: number;
  rotation: Rotation;
}

export interface FractionalPoint {
  x: number;
  y: number;
}

/** Displayed, top-left origin, fractions of the page. */
export interface FractionalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Unrotated PDF user space, bottom-left origin, points. */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRotation(angle: number): Rotation {
  return ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** Size of the visible box in unrotated user space. */
export function unrotatedSize(page: PageBox): { width: number; height: number } {
  const swap = page.rotation === 90 || page.rotation === 270;
  return swap ? { width: page.height_pt, height: page.width_pt } : { width: page.width_pt, height: page.height_pt };
}

/** Displayed fraction point → PDF user-space point. */
export function fractionToPdfPoint(page: PageBox, point: FractionalPoint): { x: number; y: number } {
  const { width: wu, height: hu } = unrotatedSize(page);
  const dx = point.x * page.width_pt;
  const dy = point.y * page.height_pt;
  let ux: number;
  let uy: number;
  switch (page.rotation) {
    case 0:
      ux = dx;
      uy = hu - dy;
      break;
    case 90:
      ux = dy;
      uy = dx;
      break;
    case 180:
      ux = wu - dx;
      uy = dy;
      break;
    case 270:
      ux = wu - dy;
      uy = hu - dx;
      break;
  }
  return { x: page.box_x_pt + ux, y: page.box_y_pt + uy };
}

/** PDF user-space point → displayed fraction point (inverse of fractionToPdfPoint). */
export function pdfPointToFraction(page: PageBox, point: { x: number; y: number }): FractionalPoint {
  const { width: wu, height: hu } = unrotatedSize(page);
  const ux = point.x - page.box_x_pt;
  const uy = point.y - page.box_y_pt;
  let dx: number;
  let dy: number;
  switch (page.rotation) {
    case 0:
      dx = ux;
      dy = hu - uy;
      break;
    case 90:
      dx = uy;
      dy = ux;
      break;
    case 180:
      dx = wu - ux;
      dy = uy;
      break;
    case 270:
      dx = hu - uy;
      dy = wu - ux;
      break;
  }
  return { x: dx / page.width_pt, y: dy / page.height_pt };
}

/** Displayed fraction rect → unrotated PDF user-space rect. */
export function fractionRectToPdfRect(page: PageBox, rect: FractionalRect): PdfRect {
  const a = fractionToPdfPoint(page, { x: rect.x, y: rect.y });
  const b = fractionToPdfPoint(page, { x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Unrotated PDF user-space rect → displayed fraction rect. */
export function pdfRectToFractionRect(page: PageBox, rect: PdfRect): FractionalRect {
  const a = pdfPointToFraction(page, { x: rect.x, y: rect.y });
  const b = pdfPointToFraction(page, { x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Keeps a rect inside the page (0..1), shrinking it if needed. */
export function clampFractionRect(rect: FractionalRect): FractionalRect {
  const width = Math.min(Math.max(rect.width, 0), 1);
  const height = Math.min(Math.max(rect.height, 0), 1);
  return {
    x: Math.min(Math.max(rect.x, 0), 1 - width),
    y: Math.min(Math.max(rect.y, 0), 1 - height),
    width,
    height,
  };
}

/**
 * Largest rect with the given aspect (width/height, in displayed points) centered inside `rect`.
 * Used to fit signature images without distortion.
 */
export function fitAspect(page: PageBox, rect: FractionalRect, aspect: number): FractionalRect {
  const wPt = rect.width * page.width_pt;
  const hPt = rect.height * page.height_pt;
  const fittedW = Math.min(wPt, hPt * aspect);
  const fittedH = fittedW / aspect;
  const width = fittedW / page.width_pt;
  const height = fittedH / page.height_pt;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}
