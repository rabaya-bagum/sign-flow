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
