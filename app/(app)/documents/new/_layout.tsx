import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme';

/** Creation wizard (SPEC §5.3). Steps 3–5 arrive in later phases. */
export default function NewDocumentLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        title: '',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: theme.colors.primary,
        headerStyle: { backgroundColor: theme.colors.background },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="source" options={{ title: t('upload.sourceTitle') }} />
      <Stack.Screen name="details" options={{ title: t('upload.detailsTitle'), headerBackVisible: false }} />
      <Stack.Screen name="recipients" options={{ title: t('upload.recipientsPlaceholderTitle') }} />
    </Stack>
  );
}
