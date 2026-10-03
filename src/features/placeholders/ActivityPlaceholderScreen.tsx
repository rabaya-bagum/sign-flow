import { PlaceholderScreen } from './PlaceholderScreen';

export function ActivityPlaceholderScreen() {
  return (
    <PlaceholderScreen
      icon="pulse-outline"
      titleKey="placeholders.activityTitle"
      bodyKey="placeholders.activityBody"
      phase={7}
      largeTitle
    />
  );
}
