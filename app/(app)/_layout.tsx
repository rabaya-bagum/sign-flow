import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useProfileThemeSync } from '@/features/account/hooks';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  useProfileThemeSync();

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: theme.colors.primary,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTitleStyle: { color: theme.colors.textPrimary },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ presentation: 'modal', title: t('search.title') }} />
      <Stack.Screen
        name="notifications"
        options={{ presentation: 'modal', title: t('placeholders.notificationsTitle') }}
      />
      <Stack.Screen name="documents/new" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="documents/[id]/index" options={{ title: t('details.title') }} />
      <Stack.Screen name="documents/[id]/view" options={{ title: t('viewer.title') }} />
      <Stack.Screen
        name="documents/[id]/fields"
        options={{ title: t('editor.title'), gestureEnabled: false }}
      />
    </Stack>
  );
}
