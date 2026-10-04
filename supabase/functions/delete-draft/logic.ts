import type { RequestContext } from '../_shared/context.ts';
import { z } from '../_shared/deps.ts';
import { loadOwnedDocument } from '../_shared/documents.ts';
import { logEvent } from '../_shared/events.ts';
import { HttpError } from '../_shared/http.ts';

export const DeleteDraftInput = z.object({ document_id: z.uuid() });

/**
 * Soft-deletes a draft (SPEC §6.2): removes its storage objects, sets deleted_at and logs
 * DOCUMENT_DELETED. The row stays so the append-only audit log never dangles.
 */
export async function deleteDraft(input: z.output<typeof DeleteDraftInput>, ctx: RequestContext) {
  const doc = await loadOwnedDocument(ctx, input.document_id);
  if (doc.status !== 'draft') {
    throw new HttpError('INVALID_STATE', 409, 'Only drafts can be deleted; void sent documents instead');
  }

  const prefix = `${doc.owner_id}/${doc.id}`;
  const { data: objects, error: listError } = await ctx.admin.storage.from('documents').list(prefix);
  if (listError) throw listError;
  if (objects && objects.length > 0) {
    const { error } = await ctx.admin.storage
      .from('documents')
      .remove(objects.map((o) => `${prefix}/${o.name}`));
    if (error) throw error;
  }

  const { error } = await ctx.admin
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', doc.id)
    .eq('status', 'draft')
    .is('deleted_at', null);
  if (error) throw error;

  await logEvent(ctx, doc.id, 'DOCUMENT_DELETED', 'Draft deleted');
  return { document_id: doc.id, deleted: true };
}
