/**
 * Generates PDF/image fixtures for tests and the seed files for local storage.
 *
 *   npx deno run --node-modules-dir=none -A scripts/generate-fixtures.ts
 *
 * Outputs (committed; all small):
 *   fixtures/pdf/*.pdf, fixtures/images/*.png   — test inputs (SPEC §8.1 geometry cases, bad files)
 *   supabase/seed/storage/documents/…           — originals for the seed documents (objects_path)
 *   supabase/seed/seed_documents.sql            — matching original_path / sha256 / size / pages
 *
 * Large fixtures (201 pages, ~25 MB) are generated at test time instead (see
 * supabase/functions/_shared/test/fixtures.ts).
 */
import { degrees, PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const root = new URL('../', import.meta.url);
const out = (p: string) => new URL(p, root);

async function write(path: string, bytes: Uint8Array) {
  const url = out(path);
  await Deno.mkdir(new URL('./', url), { recursive: true });
  await Deno.writeFile(url, bytes);
  console.log(`${path} (${bytes.length} B)`);
}

const LETTER: [number, number] = [612, 792];
const A4: [number, number] = [595.28, 841.89];
const A6: [number, number] = [297.64, 419.53];

async function labelledPdf(pages: { size: [number, number]; label: string; rotate?: number }[]) {
  const doc = await PDFDocument.create();
  doc.setTitle('SignFlow fixture');
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const page = doc.addPage(p.size);
    page.drawText(p.label, { x: 48, y: p.size[1] - 72, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawRectangle({
      x: 24,
      y: 24,
      width: p.size[0] - 48,
      height: p.size[1] - 48,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return doc;
}

const save = (doc: PDFDocument, useObjectStreams = true) => doc.save({ useObjectStreams });

// --- Geometry fixtures ------------------------------------------------------------------------
await write(
  'fixtures/pdf/portrait-3p.pdf',
  await save(
    await labelledPdf([1, 2, 3].map((n) => ({ size: LETTER, label: `Portrait Letter, page ${n} of 3` }))),
  ),
);
await write(
  'fixtures/pdf/landscape-a4.pdf',
  await save(await labelledPdf([{ size: [A4[1], A4[0]], label: 'Landscape A4' }])),
);
await write(
  'fixtures/pdf/rotated-90.pdf',
  await save(await labelledPdf([{ size: LETTER, label: 'Letter with /Rotate 90', rotate: 90 }])),
);
await write(
  'fixtures/pdf/mixed-sizes.pdf',
  await save(
    await labelledPdf([
      { size: LETTER, label: 'Letter portrait' },
      { size: [A4[1], A4[0]], label: 'A4 landscape' },
      { size: A6, label: 'A6 portrait' },
      { size: LETTER, label: 'Letter, /Rotate 270', rotate: 270 },
    ]),
  ),
);
{
  const doc = await labelledPdf([{ size: LETTER, label: 'Offset CropBox 36,36 to 576,756' }]);
  doc.getPage(0).setCropBox(36, 36, 540, 720);
  await write('fixtures/pdf/offset-cropbox.pdf', await save(doc));
}
{
  const doc = await labelledPdf([{ size: LETTER, label: 'MediaBox origin at 100,100' }]);
  doc.getPage(0).setMediaBox(100, 100, 612, 792);
  await write('fixtures/pdf/nonzero-origin.pdf', await save(doc));
}

// --- Bad inputs -------------------------------------------------------------------------------
const portrait = await Deno.readFile(out('fixtures/pdf/portrait-3p.pdf'));
// Corrupt: keep the header but cut the file mid-stream (no xref, no trailer).
await write('fixtures/pdf/corrupt.pdf', portrait.slice(0, Math.floor(portrait.length * 0.35)));

{
  // Encrypted: pdf-lib cannot encrypt, so add a Standard security handler /Encrypt entry to a
  // classic trailer. Readers (and pdf-lib) treat the file as encrypted.
  const doc = await labelledPdf([{ size: LETTER, label: 'Encrypted' }]);
  const text = new TextDecoder('latin1').decode(await save(doc, false));
  const hex32 = '00'.repeat(32);
  const encrypt = `/Encrypt << /Filter /Standard /V 1 /R 2 /O <${hex32}> /U <${hex32}> /P -44 >> /ID [<${'ab'.repeat(16)}> <${'ab'.repeat(16)}>]`;
  const patched = text.replace(/trailer\s*<</, (m) => `${m}\n${encrypt}\n`);
  if (patched === text) throw new Error('trailer not found');
  await write(
    'fixtures/pdf/encrypted.pdf',
    Uint8Array.from(patched, (c) => c.charCodeAt(0) & 0xff),
  );
}

// --- Images (minimal PNG encoder; deflate via CompressionStream) ------------------------------
function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length);
    body.set(new TextEncoder().encode(type), 0);
    body.set(data, 4);
    const outBytes = new Uint8Array(8 + data.length + 4);
    const view = new DataView(outBytes.buffer);
    view.setUint32(0, data.length);
    outBytes.set(body, 4);
    view.setUint32(8 + data.length, crc32(body));
    return outBytes;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    total.set(p, offset);
    offset += p.length;
  }
  return total;
}

const page = (x: number, y: number, w: number, h: number): [number, number, number] =>
  y < h * 0.12 ? [43, 89, 217] : x % 40 < 2 || y % 40 < 2 ? [200, 200, 200] : [250, 250, 248];
await write('fixtures/images/scan-portrait.png', await png(600, 800, (x, y) => page(x, y, 600, 800)));
await write('fixtures/images/scan-landscape.png', await png(800, 600, (x, y) => page(x, y, 800, 600)));
await write('fixtures/pdf/png-renamed.pdf', await Deno.readFile(out('fixtures/images/scan-portrait.png')));

// --- Seed originals (match supabase/seed.sql documents) ---------------------------------------
const OWNER = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const seedDocs: { id: string; owner: string; title: string; pages: number }[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', owner: OWNER, title: 'Mutual NDA', pages: 3 },
  { id: 'a0000000-0000-4000-8000-000000000002', owner: OWNER, title: 'Employment Agreement', pages: 8 },
  { id: 'a0000000-0000-4000-8000-000000000003', owner: OWNER, title: 'Consulting Contract', pages: 5 },
  { id: 'a0000000-0000-4000-8000-000000000004', owner: OWNER, title: 'Rental Agreement', pages: 12 },
  { id: 'a0000000-0000-4000-8000-000000000005', owner: OWNER, title: 'Insurance Form', pages: 2 },
  { id: 'a0000000-0000-4000-8000-000000000006', owner: OWNER, title: 'Vendor Agreement', pages: 4 },
  { id: 'a0000000-0000-4000-8000-000000000007', owner: RECIPIENT, title: 'Lease Renewal', pages: 2 },
];

const sql: string[] = [
  '-- GENERATED by scripts/generate-fixtures.ts — do not edit by hand.',
  '-- Links seed documents to the originals uploaded from supabase/seed/storage/documents.',
  '-- updated_at is preserved so the seed keeps its intended recency order.',
  'alter table public.documents disable trigger documents_set_updated_at;',
];
for (const d of seedDocs) {
  const doc = await labelledPdf(
    Array.from({ length: d.pages }, (_, i) => ({
      size: LETTER,
      label: `${d.title}, page ${i + 1} of ${d.pages}`,
    })),
  );
  const bytes = await save(doc);
  const path = `${d.owner}/${d.id}/original.pdf`;
  await write(`supabase/seed/storage/documents/${path}`, bytes);
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  sql.push(
    `update public.documents set original_path = '${path}', original_sha256 = '${sha}', file_size_bytes = ${bytes.length}, page_count = ${d.pages} where id = '${d.id}';`,
    `insert into public.document_pages (document_id, page_number, width_pt, height_pt, box_x_pt, box_y_pt, rotation) select '${d.id}', n, 612, 792, 0, 0, 0 from generate_series(1, ${d.pages}) n;`,
  );
}
sql.push('alter table public.documents enable trigger documents_set_updated_at;');
await write('supabase/seed/seed_documents.sql', new TextEncoder().encode(sql.join('\n') + '\n'));
