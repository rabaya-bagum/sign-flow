import fc from 'fast-check';

import {
  clampFractionRect,
  fitAspect,
  fractionRectToPdfRect,
  fractionToPdfPoint,
  normalizeRotation,
  pdfPointToFraction,
  pdfRectToFractionRect,
  type PageBox,
  type Rotation,
} from '../geometry';

const letter = (rotation: Rotation = 0, box_x_pt = 0, box_y_pt = 0): PageBox => {
  const swap = rotation === 90 || rotation === 270;
  return { width_pt: swap ? 792 : 612, height_pt: swap ? 612 : 792, box_x_pt, box_y_pt, rotation };
};

describe('fractionToPdfPoint', () => {
  it('maps the corners of an unrotated page (top-left origin → bottom-left origin)', () => {
    expect(fractionToPdfPoint(letter(), { x: 0, y: 0 })).toEqual({ x: 0, y: 792 });
    expect(fractionToPdfPoint(letter(), { x: 1, y: 1 })).toEqual({ x: 612, y: 0 });
  });

  it('matches pdf.js for /Rotate 90 (displayed top-left is the PDF origin)', () => {
    // Reference values from pdf.js viewport.convertToPdfPoint on fixtures/pdf/rotated-90.pdf.
    expect(fractionToPdfPoint(letter(90), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(fractionToPdfPoint(letter(90), { x: 1, y: 1 })).toEqual({ x: 612, y: 792 });
  });

  it('adds the visible box origin (offset CropBox / non-zero MediaBox)', () => {
    // Reference: pdf.js maps the top-left of fixtures/pdf/offset-cropbox.pdf to (36, 756).
    const page: PageBox = { width_pt: 540, height_pt: 720, box_x_pt: 36, box_y_pt: 36, rotation: 0 };
    expect(fractionToPdfPoint(page, { x: 0, y: 0 })).toEqual({ x: 36, y: 756 });
  });
});

const rotationArb = fc.constantFrom<Rotation>(0, 90, 180, 270);
const pageArb = fc.record({
  width_pt: fc.double({ min: 50, max: 3000, noNaN: true }),
  height_pt: fc.double({ min: 50, max: 3000, noNaN: true }),
  box_x_pt: fc.double({ min: -500, max: 500, noNaN: true }),
  box_y_pt: fc.double({ min: -500, max: 500, noNaN: true }),
  rotation: rotationArb,
});
const fraction = fc.double({ min: 0, max: 1, noNaN: true });

describe('round trips (property-based)', () => {
  it('fraction → PDF → fraction is the identity', () => {
    fc.assert(
      fc.property(pageArb, fraction, fraction, (page, x, y) => {
        const back = pdfPointToFraction(page, fractionToPdfPoint(page, { x, y }));
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }),
    );
  });

  it('rects survive the round trip and keep their displayed size in points', () => {
    fc.assert(
      fc.property(pageArb, fraction, fraction, fraction, fraction, (page, a, b, c, d) => {
        const rect = clampFractionRect({ x: a, y: b, width: c * (1 - a), height: d * (1 - b) });
        const pdf = fractionRectToPdfRect(page, rect);
        const back = pdfRectToFractionRect(page, pdf);
        for (const k of ['x', 'y', 'width', 'height'] as const) expect(back[k]).toBeCloseTo(rect[k], 6);
        const swap = page.rotation === 90 || page.rotation === 270;
        const [w, h] = swap ? [pdf.height, pdf.width] : [pdf.width, pdf.height];
        expect(w).toBeCloseTo(rect.width * page.width_pt, 6);
        expect(h).toBeCloseTo(rect.height * page.height_pt, 6);
      }),
    );
  });

  it('every rotation maps the page onto the visible box exactly', () => {
    fc.assert(
      fc.property(pageArb, (page) => {
        const full = fractionRectToPdfRect(page, { x: 0, y: 0, width: 1, height: 1 });
        const swap = page.rotation === 90 || page.rotation === 270;
        expect(full.x).toBeCloseTo(page.box_x_pt, 6);
        expect(full.y).toBeCloseTo(page.box_y_pt, 6);
        expect(full.width).toBeCloseTo(swap ? page.height_pt : page.width_pt, 6);
        expect(full.height).toBeCloseTo(swap ? page.width_pt : page.height_pt, 6);
      }),
    );
  });
});

describe('helpers', () => {
  it('normalizes rotation angles', () => {
    expect([0, 90, 180, 270, 360, -90, 450, 89].map(normalizeRotation)).toEqual([0, 90, 180, 270, 0, 270, 90, 90]);
  });

  it('clamps rects into the page', () => {
    expect(clampFractionRect({ x: 0.9, y: -0.2, width: 0.3, height: 0.5 })).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.5 });
    expect(clampFractionRect({ x: 0.5, y: 0.5, width: 2, height: 2 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('fits an aspect ratio inside a rect, centered', () => {
    const page = letter();
    // 0.5 × 0.1 of Letter = 306 × 79.2 pt; a 3:1 image fits 237.6 × 79.2 pt.
    const fitted = fitAspect(page, { x: 0.1, y: 0.1, width: 0.5, height: 0.1 }, 3);
    expect(fitted.height).toBeCloseTo(0.1, 6);
    expect(fitted.width * 612).toBeCloseTo(237.6, 6);
    expect(fitted.x + fitted.width / 2).toBeCloseTo(0.35, 6);
  });
});
