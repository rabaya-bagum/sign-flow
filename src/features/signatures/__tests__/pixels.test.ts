import {
  applyThreshold,
  initialsFromName,
  inkBounds,
  isTrivialDrawing,
  outputSize,
  padBounds,
  segmentWidths,
  suggestThreshold,
  type Point,
} from '../pixels';

function canvas(width: number, height: number, ink: (x: number, y: number) => boolean, colour = [0, 0, 0]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (ink(x, y)) rgba.set([...colour, 255], i);
    }
  return rgba;
}

/** Opaque "photo" of paper (light grey) with dark ink where `ink` is true. */
function photo(width: number, height: number, ink: (x: number, y: number) => boolean) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rgba.set(ink(x, y) ? [30, 30, 60, 255] : [235, 232, 225, 255], (y * width + x) * 4);
  return rgba;
}

describe('inkBounds', () => {
  it('finds the ink bounding box', () => {
    const rgba = canvas(100, 50, (x, y) => x >= 10 && x < 30 && y >= 5 && y < 45);
    expect(inkBounds(rgba, 100, 50)).toEqual({ x: 10, y: 5, width: 20, height: 40 });
  });
  it('returns null for an empty canvas and ignores faint pixels', () => {
    expect(inkBounds(new Uint8Array(40 * 40 * 4), 40, 40)).toBeNull();
    const faint = new Uint8Array(4 * 4 * 4);
    faint[3] = 8;
    expect(inkBounds(faint, 4, 4)).toBeNull();
  });
});

describe('padBounds / outputSize', () => {
  it('pads by 4% of the long edge on every side', () => {
    expect(padBounds({ x: 100, y: 50, width: 500, height: 100 })).toEqual({
      x: 80,
      y: 30,
      width: 540,
      height: 140,
    });
  });
  it('scales the long edge into 600–1200 px', () => {
    expect(outputSize(300, 100)).toEqual({ width: 600, height: 200, scale: 2 });
    expect(outputSize(2400, 600)).toEqual({ width: 1200, height: 300, scale: 0.5 });
    expect(outputSize(900, 450)).toEqual({ width: 900, height: 450, scale: 1 });
    expect(outputSize(200, 400).height).toBe(600);
  });
});

describe('applyThreshold / suggestThreshold', () => {
  const width = 60;
  const height = 20;
  const ink = (x: number, y: number) => y >= 8 && y < 12 && x >= 5 && x < 55;
  const rgba = photo(width, height, ink);

  it('suggests a threshold between ink and paper', () => {
    const t = suggestThreshold(rgba);
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(220);
  });

  it('makes paper transparent and keeps ink opaque', () => {
    const out = applyThreshold(rgba, suggestThreshold(rgba));
    expect(inkBounds(out, width, height)).toEqual({ x: 5, y: 8, width: 50, height: 4 });
    expect(out[(10 * width + 10) * 4 + 3]).toBe(255);
    expect(out[(2 * width + 2) * 4 + 3]).toBe(0);
    expect(Array.from(out.slice((10 * width + 10) * 4, (10 * width + 10) * 4 + 3))).toEqual([30, 30, 60]);
  });

  it('ramps alpha inside the softness band', () => {
    const grey = new Uint8Array([120, 120, 120, 255]);
    expect(applyThreshold(grey, 132, 24)[3]).toBe(Math.round((12 / 24) * 255));
  });
});

describe('drawing checks', () => {
  const line = (x0: number, x1: number, y: number): Point[] =>
    Array.from({ length: 30 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 29, y, t: i * 16 }));

  it('rejects dots and tiny scribbles', () => {
    expect(isTrivialDrawing([], 300, 100)).toBe(true);
    expect(isTrivialDrawing([[{ x: 10, y: 10, t: 0 }]], 300, 100)).toBe(true);
    expect(isTrivialDrawing([line(10, 30, 50)], 300, 100)).toBe(true);
  });

  it('accepts a signature-sized scrawl', () => {
    expect(isTrivialDrawing([line(20, 200, 40), line(30, 250, 60)], 300, 100)).toBe(false);
  });

  it('draws fast segments thinner than slow ones', () => {
    const slow: Point[] = [
      { x: 0, y: 0, t: 0 },
      { x: 2, y: 0, t: 40 },
      { x: 4, y: 0, t: 80 },
      { x: 6, y: 0, t: 120 },
    ];
    const fast: Point[] = [
      { x: 0, y: 0, t: 0 },
      { x: 40, y: 0, t: 8 },
      { x: 80, y: 0, t: 16 },
      { x: 120, y: 0, t: 24 },
    ];
    expect(segmentWidths(fast, 3).at(-1)!).toBeLessThan(segmentWidths(slow, 3).at(-1)!);
  });
});

describe('initialsFromName', () => {
  it.each([
    ['Aaliyah Fatimah', 'AF'],
    ['john doe', 'JD'],
    ['  Madonna ', 'M'],
    ['Jean-Luc de la Croix', 'JC'],
    ['Élodie Ångström', 'ÉÅ'],
    ['', ''],
  ])('%s → %s', (name, initials) => {
    expect(initialsFromName(name)).toBe(initials);
  });
});
