import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { HttpError } from '../_shared/http.ts';
import {
  admin,
  createDraft,
  createUser,
  events,
  storageHas,
  TEST_IP,
  TEST_UA,
  uploadOriginal,
  type TestUser,
} from '../_shared/test/harness.ts';
import { blankPdf, fixture, paddedPdf } from '../_shared/test/fixtures.ts';
import { processUpload } from '../process-upload/logic.ts';

const owner: TestUser = await createUser('owner');

async function draftWith(bytes: Uint8Array, title = 'Fixture'): Promise<string> {
  const id = await createDraft(owner, title);
  const { error } = await uploadOriginal(owner, id, bytes);
  if (error) throw error;
  return id;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await assertRejects(() => promise as Promise<unknown>, HttpError);
  assertEquals(error.code, code);
}

async function pages(documentId: string) {
  const { data } = await admin()
    .from('document_pages')
    .select('page_number, width_pt, height_pt, box_x_pt, box_y_pt, rotation')
    .eq('document_id', documentId)
    .order('page_number');
  return data!.map((p) => ({
    ...p,
    width_pt: Number(p.width_pt),
    height_pt: Number(p.height_pt),
    box_x_pt: Number(p.box_x_pt),
    box_y_pt: Number(p.box_y_pt),
  }));
}

Deno.test('processes a 3-page PDF: pages, hash, size, event with IP and user agent', async () => {
  const bytes = fixture('pdf/portrait-3p.pdf');
  const id = await draftWith(bytes);
  const result = await processUpload({ document_id: id }, owner.ctx);

  assertEquals(result.page_count, 3);
  assertEquals(result.file_size_bytes, bytes.length);
  assertEquals(result.original_sha256.length, 64);
  assertEquals((await pages(id)).length, 3);

  const { data: doc } = await admin()
    .from('documents')
    .select('original_path, page_count, file_size_bytes')
    .eq('id', id)
    .single();
  assertEquals(doc, {
    original_path: `${owner.id}/${id}/original.pdf`,
    page_count: 3,
    file_size_bytes: bytes.length,
  });

  const uploaded = (await events(id)).filter((e) => e.type === 'DOCUMENT_UPLOADED');
  assertEquals(uploaded.length, 1);
  assertEquals(uploaded[0]!.ip, TEST_IP);
  assertEquals(uploaded[0]!.user_agent, TEST_UA);
  assertEquals(uploaded[0]!.actor_user_id, owner.id);
});

Deno.test('records page geometry using the visible-box convention (SPEC §8.1)', async (t) => {
  type Geometry = {
    width_pt: number;
    height_pt: number;
    box_x_pt: number;
    box_y_pt: number;
    rotation: number;
  };
  const cases: [string, Geometry[]][] = [
    [
      'pdf/landscape-a4.pdf',
      [{ width_pt: 841.89, height_pt: 595.28, box_x_pt: 0, box_y_pt: 0, rotation: 0 }],
    ],
    ['pdf/rotated-90.pdf', [{ width_pt: 792, height_pt: 612, box_x_pt: 0, box_y_pt: 0, rotation: 90 }]],
    ['pdf/offset-cropbox.pdf', [{ width_pt: 540, height_pt: 720, box_x_pt: 36, box_y_pt: 36, rotation: 0 }]],
    [
      'pdf/nonzero-origin.pdf',
      [{ width_pt: 612, height_pt: 792, box_x_pt: 100, box_y_pt: 100, rotation: 0 }],
    ],
    [
      'pdf/mixed-sizes.pdf',
      [
        { width_pt: 612, height_pt: 792, box_x_pt: 0, box_y_pt: 0, rotation: 0 },
        { width_pt: 841.89, height_pt: 595.28, box_x_pt: 0, box_y_pt: 0, rotation: 0 },
        { width_pt: 297.64, height_pt: 419.53, box_x_pt: 0, box_y_pt: 0, rotation: 0 },
        { width_pt: 792, height_pt: 612, box_x_pt: 0, box_y_pt: 0, rotation: 270 },
      ],
    ],
  ];
  for (const [file, expected] of cases) {
    await t.step(file, async () => {
      const id = await draftWith(fixture(file));
      await processUpload({ document_id: id }, owner.ctx);
      assertEquals(
        (await pages(id)).map(({ page_number: _n, ...g }) => g),
        expected,
      );
    });
  }
});

Deno.test('rejects bad files with typed errors, removes the object, keeps a retryable draft', async (t) => {
  const cases: [string, () => Promise<Uint8Array>, string][] = [
    ['encrypted', async () => fixture('pdf/encrypted.pdf'), 'FILE_UNSUPPORTED'],
    ['corrupt', async () => fixture('pdf/corrupt.pdf'), 'PDF_RENDER_FAILED'],
    ['PNG renamed to .pdf', async () => fixture('pdf/png-renamed.pdf'), 'FILE_UNSUPPORTED'],
    ['201 pages', () => blankPdf(201), 'FILE_TOO_LARGE'],
  ];
  for (const [name, make, code] of cases) {
    await t.step(name, async () => {
      const id = await draftWith(await make(), name);
      await expectCode(processUpload({ document_id: id }, owner.ctx), code);
      assertEquals(await storageHas('documents', `${owner.id}/${id}/original.pdf`), false);
      const { data } = await owner.client
        .from('documents')
        .select('original_path, status')
        .eq('id', id)
        .single();
      assertEquals(data, { original_path: null, status: 'draft' });
      // The draft accepts a new upload after the rejection.
      const retry = await uploadOriginal(owner, id, fixture('pdf/portrait-3p.pdf'));
      assertEquals(retry.error, null);
    });
  }
});

Deno.test('storage itself refuses PDFs over the 25 MB bucket limit', async () => {
  const id = await createDraft(owner, 'Too big');
  const big = await paddedPdf(2, 25 * 1024 * 1024 + 200_000);
  const { error } = await uploadOriginal(owner, id, big);
  assert(error, 'expected the bucket size limit to reject the upload');
  await expectCode(processUpload({ document_id: id }, owner.ctx), 'UPLOAD_FAILED');
});

Deno.test('converts images from uploads-tmp into an A4 PDF and deletes the temp images', async () => {
  const id = await createDraft(owner, 'Scan');
  const paths = [`${owner.id}/${crypto.randomUUID()}.png`, `${owner.id}/${crypto.randomUUID()}.png`];
  for (const [i, p] of paths.entries()) {
    const { error } = await owner.client.storage
      .from('uploads-tmp')
      .upload(p, fixture(i === 0 ? 'images/scan-portrait.png' : 'images/scan-landscape.png'), {
        contentType: 'image/png',
      });
    if (error) throw error;
  }
  const result = await processUpload({ document_id: id, image_paths: paths }, owner.ctx);
  assertEquals(result.page_count, 2);
  const geometry = await pages(id);
  assertEquals([geometry[0]!.width_pt, geometry[0]!.height_pt], [595.28, 841.89]);
  assertEquals([geometry[1]!.width_pt, geometry[1]!.height_pt], [841.89, 595.28]);
  for (const p of paths) assertEquals(await storageHas('uploads-tmp', p), false);
  const uploaded = (await events(id)).find((e) => e.type === 'DOCUMENT_UPLOADED');
  assertEquals(uploaded?.metadata, {
    source: 'images',
    image_count: 2,
    page_count: 2,
    file_size_bytes: result.file_size_bytes,
  });
});

Deno.test("refuses image paths outside the caller's folder", async () => {
  const id = await createDraft(owner, 'Sneaky');
  await expectCode(
    processUpload(
      { document_id: id, image_paths: ['00000000-0000-4000-8000-000000000000/x.png'] },
      owner.ctx,
    ),
    'FORBIDDEN',
  );
  await expectCode(
    processUpload({ document_id: id, image_paths: [`${owner.id}/../other/x.png`] }, owner.ctx),
    'FORBIDDEN',
  );
});

Deno.test("another user cannot process someone else's draft", async () => {
  const id = await draftWith(fixture('pdf/portrait-3p.pdf'), 'Not yours');
  const stranger = await createUser('stranger');
  await expectCode(processUpload({ document_id: id }, stranger.ctx), 'NOT_FOUND');
  // Storage RLS also blocks writing into another user's folder.
  const { error } = await stranger.client.storage
    .from('documents')
    .upload(`${owner.id}/${id}/original.pdf`, fixture('pdf/portrait-3p.pdf'), { upsert: true });
  assert(error);
});

Deno.test('only drafts can be processed', async () => {
  const { data, error } = await admin()
    .from('documents')
    .insert({ owner_id: owner.id, title: 'Sent', status: 'in_progress', current_signing_order: 1 })
    .select('id')
    .single();
  if (error) throw error;
  await expectCode(processUpload({ document_id: data.id }, owner.ctx), 'INVALID_STATE');
});

Deno.test('is idempotent: a second call returns the same result without a second event', async () => {
  const id = await draftWith(fixture('pdf/portrait-3p.pdf'));
  const first = await processUpload({ document_id: id }, owner.ctx);
  const second = await processUpload({ document_id: id }, owner.ctx);
  assertEquals(second, first);
  assertEquals((await events(id)).filter((e) => e.type === 'DOCUMENT_UPLOADED').length, 1);
  // And the processed original cannot be replaced by the client.
  const { error } = await uploadOriginal(owner, id, fixture('pdf/landscape-a4.pdf'));
  assert(error);
});

Deno.test('reports UPLOAD_FAILED when no file was uploaded', async () => {
  const id = await createDraft(owner, 'Empty');
  await expectCode(processUpload({ document_id: id }, owner.ctx), 'UPLOAD_FAILED');
});
