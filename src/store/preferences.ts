import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

interface PreferencesState {
  /** Local copy of the theme; the signed-in user's profile is the source of truth when available. */
  theme: ThemePreference;
  onboardingSeen: boolean;
  hydrated: boolean;
  setTheme: (theme: ThemePreference) => void;
  setOnboardingSeen: (seen: boolean) => void;
}

// Non-sensitive device preferences only. Never store tokens or document data here.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      onboardingSeen: false,
      hydrated: false,
      setTheme: (theme) => set({ theme }),
      setOnboardingSeen: (onboardingSeen) => set({ onboardingSeen }),
    }),
    {
      name: 'signflow.preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ theme, onboardingSeen }) => ({ theme, onboardingSeen }),
      onRehydrateStorage: () => () => {
        usePreferencesStore.setState({ hydrated: true });
      },
    },
  ),
);

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}
