import type { ProfileValues } from '@shared/auth';

import { toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { ThemePreference } from '@/store/preferences';
import type { Database } from '@/types/database';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateProfile(userId: string, values: ProfileValues): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: values.fullName, phone: values.phone || null })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateThemePreference(userId: string, theme: ThemePreference): Promise<void> {
  const { error } = await supabase.from('profiles').update({ theme }).eq('id', userId);
  if (error) throw toAppError(error);
}

export const AVATAR_SIZE_PX = 512;

/** Crops are done in the picker; this resizes to 512 px JPEG and stores avatars/{uid}/avatar.jpg. */
export async function uploadAvatar(userId: string, localUri: string): Promise<Profile> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const ref = await ImageManipulator.manipulate(localUri)
    .resize({ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX })
    .renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const { fileUriSource } = await import('@/features/upload/chunkSource');
  const { uploadToStorage } = await import('@/features/upload/storageUpload');
  const path = `${userId}/avatar.jpg`;
  await uploadToStorage({
    bucket: 'avatars',
    path,
    contentType: 'image/jpeg',
    source: await fileUriSource(saved.uri),
    upsert: true,
  });
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw toAppError(error);
  return data;
}

export async function removeAvatar(userId: string): Promise<Profile> {
  const path = `${userId}/avatar.jpg`;
  const { error: storageError } = await supabase.storage.from('avatars').remove([path]);
  if (storageError) throw toAppError(storageError);
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_path: null })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw toAppError(error);
  return data;
}

/** Avatars are private; display them through a short-lived signed URL. */
export async function avatarSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
  if (error) throw toAppError(error);
  return data.signedUrl;
}

/** Default expiry and reminder interval for new documents (SPEC §5.10, §11). */
export async function updateSigningDefaults(
  userId: string,
  values: { expiryDays: number; reminderDays: number | null },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      default_expiry_days: values.expiryDays,
      default_reminder: values.reminderDays
        ? { first_after_days: values.reminderDays, repeat_every_days: values.reminderDays }
        : { first_after_days: null, repeat_every_days: null },
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw toAppError(error);
  return data;
}
