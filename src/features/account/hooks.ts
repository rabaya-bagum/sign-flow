import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ProfileValues } from '@shared/auth';
import { AppError } from '@shared/errors';

import { useCurrentUserId } from '@/features/auth/store';
import { queryKeys } from '@/lib/queryKeys';
import { isThemePreference, usePreferencesStore, type ThemePreference } from '@/store/preferences';

import {
  avatarSignedUrl,
  fetchProfile,
  removeAvatar,
  updateProfile,
  updateSigningDefaults,
  updateThemePreference,
  uploadAvatar,
  type Profile,
} from './api';

function requireUser(userId: string | null): string {
  if (!userId) throw new AppError('FORBIDDEN');
  return userId;
}

export function useProfile() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'anonymous'),
    queryFn: () => fetchProfile(requireUser(userId)),
    enabled: Boolean(userId),
  });
}

export function useUpdateProfile() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProfileValues) => updateProfile(requireUser(userId), values),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile(profile.id), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

export function useUpdateSigningDefaults() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { expiryDays: number; reminderDays: number | null }) =>
      updateSigningDefaults(requireUser(userId), values),
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.profile(profile.id), profile),
  });
}

/** Applies the theme locally right away, then persists it to the profile. */
export function useSetTheme() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const setLocalTheme = usePreferencesStore((s) => s.setTheme);
  return useMutation({
    mutationFn: async (theme: ThemePreference) => {
      setLocalTheme(theme);
      if (userId) await updateThemePreference(userId, theme);
      return theme;
    },
    onSuccess: (theme) => {
      if (!userId) return;
      queryClient.setQueryData<Profile>(queryKeys.profile(userId), (old) => (old ? { ...old, theme } : old));
    },
  });
}

/** When signed in, the profile's theme wins over the device's local copy (SPEC §5.10). */
export function useProfileThemeSync() {
  const { data } = useProfile();
  const setLocalTheme = usePreferencesStore((s) => s.setTheme);
  const profileTheme = data?.theme;
  useEffect(() => {
    if (isThemePreference(profileTheme)) setLocalTheme(profileTheme);
  }, [profileTheme, setLocalTheme]);
}

/** Signed URL for the profile photo; the profile's updated_at busts caches after a change. */
export function useAvatarUrl(profile: Profile | undefined) {
  const path = profile?.avatar_path ?? null;
  return useQuery({
    queryKey: [...queryKeys.avatarUrl(path ?? 'none'), profile?.updated_at],
    queryFn: async () => `${await avatarSignedUrl(path!)}&v=${encodeURIComponent(profile?.updated_at ?? '')}`,
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
  });
}

export function useAvatarMutations() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const onSuccess = (profile: Profile) => {
    queryClient.setQueryData(queryKeys.profile(profile.id), profile);
    void queryClient.invalidateQueries({ queryKey: ['avatar-url'] });
  };
  const upload = useMutation({
    mutationFn: (uri: string) => uploadAvatar(requireUser(userId), uri),
    onSuccess,
  });
  const remove = useMutation({ mutationFn: () => removeAvatar(requireUser(userId)), onSuccess });
  return { upload, remove };
}
