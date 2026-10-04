import * as Crypto from 'expo-crypto';

import { AppError } from '@shared/errors';

import { memorySource } from '@/features/upload/chunkSource';
import { uploadToStorage } from '@/features/upload/storageUpload';
import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import type { SavedSignature, SignatureKind, SignatureMethod } from './types';

/** Signed URLs for displaying saved signatures; kept in memory only (query cache). */
export const SIGNATURE_URL_TTL_SECONDS = 300;

export async function listSavedSignatures(): Promise<SavedSignature[]> {
  const { data, error } = await supabase
    .from('saved_signatures')
    .select('*')
    .order('kind')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw toAppError(error);
  return data;
}

export async function signatureImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('signatures')
    .createSignedUrl(path, SIGNATURE_URL_TTL_SECONDS);
  if (error) throw toAppError(error);
  return data.signedUrl;
}

/** Downloads a saved signature's PNG (to hand it to a document as a local file). */
export async function downloadSignature(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from('signatures').download(path);
  if (error) throw toAppError(error);
  return new Uint8Array(await data.arrayBuffer());
}

export interface SaveSignatureInput {
  userId: string;
  kind: SignatureKind;
  method: SignatureMethod;
  png: Uint8Array;
  typedText?: string;
  fontKey?: string;
}

/** Uploads signatures/{user}/{id}.png, then inserts the row. Removes the image if the insert fails. */
export async function saveSignature(input: SaveSignatureInput): Promise<SavedSignature> {
  const id = Crypto.randomUUID();
  const path = `${input.userId}/${id}.png`;
  await uploadToStorage({
    bucket: 'signatures',
    path,
    contentType: 'image/png',
    source: memorySource(input.png),
  });
  const typed = input.method === 'typed';
  const { data, error } = await supabase
    .from('saved_signatures')
    .insert({
      id,
      user_id: input.userId,
      kind: input.kind,
      method: input.method,
      storage_path: path,
      typed_text: typed ? (input.typedText ?? null) : null,
      font_key: typed ? (input.fontKey ?? null) : null,
    })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from('signatures').remove([path]);
    throw toAppError(error);
  }
  return data;
}

export async function setDefaultSignature(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_signature', { p_id: id });
  if (error) throw toAppError(error);
}

/** Deletes the row (the server promotes a new default), then the image. */
export async function deleteSignature(signature: SavedSignature): Promise<void> {
  const { error, count } = await supabase
    .from('saved_signatures')
    .delete({ count: 'exact' })
    .eq('id', signature.id);
  if (error) throw toAppError(error);
  if (count === 0) throw new AppError('NOT_FOUND');
  const { error: storageError } = await supabase.storage.from('signatures').remove([signature.storage_path]);
  // The row is gone either way; a leftover image is private and harmless, so don't fail the delete.
  if (storageError) console.warn('signature image delete failed', storageError.message);
}
