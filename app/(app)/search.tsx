import { PlaceholderScreen } from '@/features/placeholders/PlaceholderScreen';

export default function SearchRoute() {
  return (
    <PlaceholderScreen
      icon="search-outline"
      titleKey="placeholders.searchTitle"
      bodyKey="placeholders.searchBody"
      phase={2}
    />
  );
}
