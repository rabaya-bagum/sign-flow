import { fieldSchema, type Field } from '@shared/fields';

import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

/** All fields of a document (owner view), oldest first. */
export async function fetchFields(documentId: string): Promise<Field[]> {
  const { data, error } = await supabase
    .from('document_fields')
    .select('id, recipient_id, page_number, type, x, y, width, height, required, properties')
    .eq('document_id', documentId)
    .order('created_at')
    .order('id');
  if (error) throw toAppError(error);
  return data
    .filter((row) => row.type !== 'stamp')
    .map((row) =>
      fieldSchema.parse({
        ...row,
        x: Number(row.x),
        y: Number(row.y),
        width: Number(row.width),
        height: Number(row.height),
      }),
    );
}

/** Replaces the document's fields in one transaction (save_document_fields). */
export async function saveFields(documentId: string, fields: Field[]): Promise<void> {
  const { error } = await supabase.rpc('save_document_fields', {
    p_document_id: documentId,
    // Plain JSON (validated by fieldSchema when created and when read back).
    p_fields: fields as unknown as Json,
  });
  if (error) throw toAppError(error);
}

export interface RecipientInput {
  name: string;
  /** Null for a placeholder ("Signer 2") until Phase 5's recipient step fills it in. */
  email: string | null;
}

export async function addRecipient(documentId: string, input: RecipientInput, signingOrder: number) {
  const { data, error } = await supabase
    .from('document_recipients')
    .insert({
      document_id: documentId,
      name: input.name,
      email: input.email,
      role: 'signer',
      signing_order: signingOrder,
    })
    .select('id')
    .single();
  if (error) throw toAppError(error);
  return data.id;
}

export async function updateRecipient(id: string, input: RecipientInput) {
  const { error } = await supabase
    .from('document_recipients')
    .update({ name: input.name, email: input.email })
    .eq('id', id);
  if (error) throw toAppError(error);
}

export async function deleteRecipient(id: string) {
  const { error } = await supabase.from('document_recipients').delete().eq('id', id);
  if (error) throw toAppError(error);
}
