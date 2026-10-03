import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ProfileValues } from '@shared/auth';
import { AppError } from '@shared/errors';

import { useCurrentUserId } from '@/features/auth/store';
import { queryKeys } from '@/lib/queryKeys';
import { isThemePreference, usePreferencesStore, type ThemePreference } from '@/store/preferences';

import { fetchProfile, updateProfile, updateThemePreference, type Profile } from './api';

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
