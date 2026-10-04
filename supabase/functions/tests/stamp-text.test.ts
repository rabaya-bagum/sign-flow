import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';

import { pdfPointToFraction, type PageBox, type Rotation } from '../../../shared/geometry.ts';
import { PDFDocument, StandardFonts } from '../_shared/deps.ts';
import { encodableText, textPlacement } from '../_shared/pdf/stamp.ts';

const rect = { x: 0.2, y: 0.3, width: 0.4, height: 0.05 };

for (const rotation of [0, 90, 180, 270] as Rotation[]) {
  Deno.test(`text reads left to right, upright, inside its rect on a /Rotate ${rotation} page`, () => {
    const swap = rotation === 90 || rotation === 270;
    const page: PageBox = {
      width_pt: swap ? 792 : 612,
      height_pt: swap ? 612 : 792,
      box_x_pt: 10,
      box_y_pt: 20,
      rotation,
    };
    const width = 100; // pt at any size, for the test
    const at = textPlacement(page, rect, () => width, 12, 'left');
    assertEquals(at.rotate, rotation);
    // Start of the baseline, back in displayed fractions.
    const start = pdfPointToFraction(page, { x: at.x, y: at.y });
    assert(start.x >= rect.x && start.x <= rect.x + 0.02, `starts at the left edge (${start.x})`);
    assert(start.y > rect.y && start.y < rect.y + rect.height, `baseline inside the rect (${start.y})`);
    // Walk along the text direction (pdf-lib rotates counter-clockwise): it must go right on screen.
    const rad = (rotation * Math.PI) / 180;
    const end = pdfPointToFraction(page, {
      x: at.x + Math.cos(rad) * width,
      y: at.y + Math.sin(rad) * width,
    });
    assertAlmostEquals(end.y, start.y, 1e-9);
    assertAlmostEquals((end.x - start.x) * page.width_pt, width, 1e-6);
    // "Up" for the glyphs points up on screen.
    const up = pdfPointToFraction(page, { x: at.x - Math.sin(rad) * 10, y: at.y + Math.cos(rad) * 10 });
    assert(up.y < start.y, 'glyphs are upright');
  });
}

Deno.test('long text shrinks to fit; alignment moves the start', () => {
  const page: PageBox = { width_pt: 612, height_pt: 792, box_x_pt: 0, box_y_pt: 0, rotation: 0 };
  const widthAt = (size: number) => size * 40; // 40 em of text
  const fitted = textPlacement(page, rect, widthAt, 24, 'left');
  assert(widthAt(fitted.size) <= rect.width * 612, 'fits the field width');
  const right = textPlacement(page, rect, (s) => s * 2, 12, 'right');
  const centre = textPlacement(page, rect, (s) => s * 2, 12, 'center');
  assert(right.x > centre.x && centre.x > rect.x * 612);
});

Deno.test('characters outside WinAnsi are replaced, the rest kept', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assertEquals(encodableText(font, 'José Ünal 李'), 'José Ünal ?');
  const dingbats = await doc.embedFont(StandardFonts.ZapfDingbats);
  assertEquals(encodableText(dingbats, '✔●'), '✔●');
});
