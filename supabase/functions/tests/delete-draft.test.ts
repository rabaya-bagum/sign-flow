import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { HttpError } from '../_shared/http.ts';
import {
  admin,
  createDraft,
  createUser,
  events,
  storageHas,
  uploadOriginal,
} from '../_shared/test/harness.ts';
import { fixture } from '../_shared/test/fixtures.ts';
import { deleteDraft } from '../delete-draft/logic.ts';
import { processUpload } from '../process-upload/logic.ts';

const owner = await createUser('del-owner');

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await assertRejects(() => promise as Promise<unknown>, HttpError);
  assertEquals(error.code, code);
}

Deno.test('soft-deletes a draft, removes its file and logs DOCUMENT_DELETED', async () => {
  const id = await createDraft(owner, 'Delete me');
  await uploadOriginal(owner, id, fixture('pdf/portrait-3p.pdf'));
  await processUpload({ document_id: id }, owner.ctx);

  assertEquals(await deleteDraft({ document_id: id }, owner.ctx), { document_id: id, deleted: true });
  assertEquals(await storageHas('documents', `${owner.id}/${id}/original.pdf`), false);

  const { data: row } = await admin().from('documents').select('deleted_at').eq('id', id).single();
  assertEquals(typeof row?.deleted_at, 'string');
  // Invisible to the owner afterwards (RLS hides soft-deleted rows).
  const { data: visible } = await owner.client.from('documents').select('id').eq('id', id);
  assertEquals(visible, []);
  assertEquals((await events(id)).map((e) => e.type).includes('DOCUMENT_DELETED'), true);
  // A second delete reports NOT_FOUND rather than succeeding twice.
  await expectCode(deleteDraft({ document_id: id }, owner.ctx), 'NOT_FOUND');
});

Deno.test('deleting a draft that never got a file works', async () => {
  const id = await createDraft(owner, 'Abandoned');
  assertEquals((await deleteDraft({ document_id: id }, owner.ctx)).deleted, true);
});

Deno.test('non-drafts cannot be deleted', async () => {
  const { data, error } = await admin()
    .from('documents')
    .insert({ owner_id: owner.id, title: 'Sent', status: 'in_progress', current_signing_order: 1 })
    .select('id')
    .single();
  if (error) throw error;
  await expectCode(deleteDraft({ document_id: data.id }, owner.ctx), 'INVALID_STATE');
});

Deno.test("other users cannot delete someone else's draft", async () => {
  const id = await createDraft(owner, 'Mine');
  const stranger = await createUser('del-stranger');
  await expectCode(deleteDraft({ document_id: id }, stranger.ctx), 'NOT_FOUND');
  const { data } = await admin().from('documents').select('deleted_at').eq('id', id).single();
  assertEquals(data?.deleted_at, null);
});
