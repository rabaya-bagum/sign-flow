import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import type { RecipientChanges } from './logic';

/**
 * Applies the recipients step (deletes, then updates, then inserts). Updates go through a temporary
 * email first when two rows swap emails, so the per-document unique email never collides.
 */
export async function saveRecipientChanges(documentId: string, changes: RecipientChanges): Promise<void> {
  if (changes.remove.length) {
    const { error } = await supabase.from('document_recipients').delete().in('id', changes.remove);
    if (error) throw toAppError(error);
  }
  for (const u of changes.update) {
    const { error } = await supabase.from('document_recipients').update({ email: null }).eq('id', u.id);
    if (error) throw toAppError(error);
  }
  for (const u of changes.update) {
    const { error } = await supabase
      .from('document_recipients')
      .update({ name: u.name, email: u.email, role: u.role, signing_order: u.signing_order })
      .eq('id', u.id);
    if (error) throw toAppError(error);
  }
  if (changes.insert.length) {
    const { error } = await supabase
      .from('document_recipients')
      .insert(changes.insert.map((r) => ({ ...r, document_id: documentId })));
    if (error) throw toAppError(error);
  }
}
