import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme';

export default function AccountLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: t('account.editProfile') }} />
      <Stack.Screen name="preferences" options={{ title: t('account.preferences') }} />
      <Stack.Screen name="signatures" options={{ title: t('signatures.screenTitle') }} />
      <Stack.Screen name="notifications" options={{ title: t('notificationPrefs.title') }} />
      <Stack.Screen name="default-signing" options={{ title: t('defaultSigning.title') }} />
      <Stack.Screen name="security" options={{ title: t('account.security') }} />
      <Stack.Screen name="change-password" options={{ title: t('account.changePassword') }} />
      <Stack.Screen name="two-factor" options={{ title: t('account.twoFactor') }} />
      <Stack.Screen name="delete" options={{ title: t('account.deleteAccount') }} />
    </Stack>
  );
}
