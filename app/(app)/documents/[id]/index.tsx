import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/features/placeholders/PlaceholderScreen';

export default function DocumentDetailsRoute() {
  const { title } = useLocalSearchParams<{ id: string; title?: string }>();
  return (
    <PlaceholderScreen
      icon="document-text-outline"
      titleKey="placeholders.detailsTitle"
      bodyKey="placeholders.detailsBody"
      phase={2}
      heading={title}
    />
  );
}
