import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme';

/** Creation wizard (SPEC §5.3): source → details → recipients; fields and review live under documents/[id]. */
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
      <Stack.Screen name="recipients" options={{ title: t('recipients.title') }} />
    </Stack>
  );
}
