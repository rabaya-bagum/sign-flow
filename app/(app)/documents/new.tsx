import { PlaceholderScreen } from '@/features/placeholders/PlaceholderScreen';

export default function NewDocumentRoute() {
  return (
    <PlaceholderScreen
      icon="cloud-upload-outline"
      titleKey="placeholders.uploadTitle"
      bodyKey="placeholders.uploadBody"
      phase={2}
    />
  );
}
