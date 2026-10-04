import { Redirect } from 'expo-router';

import type { CoordinateSpikeScreen as Screen } from '@/features/dev/CoordinateSpikeScreen';

// Dev-only. In production builds __DEV__ is false: Metro folds the branch away, so the screen's code
// is not bundled (checked by `npm run check:dev-routes`), and the root layout's guard hides the route.
const CoordinateSpike: typeof Screen | (() => React.JSX.Element) = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/dev/CoordinateSpikeScreen').CoordinateSpikeScreen
  : () => <Redirect href="/" />;

export default CoordinateSpike;
