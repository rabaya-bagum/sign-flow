import { PDFDocument } from '../deps.ts';

const FIXTURES = new URL('../../../../fixtures/', import.meta.url);

export function fixture(path: string): Uint8Array {
  return Deno.readFileSync(new URL(path, FIXTURES));
}

/** A valid PDF with `pages` blank Letter pages. */
export async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return doc.save();
}

/**
 * A valid `pages`-page PDF padded with incompressible stream objects to about `targetBytes`.
 * Used for the size limit and the 25 MB / 200-page performance measurement.
 */
export async function paddedPdf(pages: number, targetBytes: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  const base = (await doc.save()).length;
  let remaining = Math.max(0, targetBytes - base - 64 * 1024);
  const chunk = 1024 * 1024;
  while (remaining > 0) {
    const size = Math.min(chunk, remaining);
    const bytes = new Uint8Array(size);
    for (let o = 0; o < size; o += 65536)
      crypto.getRandomValues(bytes.subarray(o, Math.min(o + 65536, size)));
    doc.context.register(doc.context.stream(bytes));
    remaining -= size;
  }
  return doc.save({ useObjectStreams: false });
}

// --- Realistic heavy fixture: one distinct, incompressible image per page --------------------

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** RGB noise PNG (does not compress, so its size ≈ width × height × 3). */
export function noisePng(width: number, height: number): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let o = 0; o < raw.length; o += 65536)
    crypto.getRandomValues(raw.subarray(o, Math.min(o + 65536, raw.length)));
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0; // filter type: none
  return encodePng(width, height, raw);
}

/** RGB PNG from a per-pixel function. */
export function rgbPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  return encodePng(width, height, raw);
}

async function encodePng(width: number, height: number, raw: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length);
    body.set(new TextEncoder().encode(type));
    body.set(data, 4);
    const out = new Uint8Array(data.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(8 + data.length, crc32(body));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** `pages` pages, each drawing its own embedded image plus text: a scanned-document-like PDF. */
export async function imageHeavyPdf(pages: number, imageSide: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    const image = await doc.embedPng(await noisePng(imageSide, imageSide));
    page.drawImage(image, { x: 56, y: 200, width: 500, height: 500 });
    page.drawText(`Page ${i + 1}`, { x: 56, y: 740, size: 14 });
  }
  return doc.save();
}
