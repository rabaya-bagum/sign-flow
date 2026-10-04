import { Redirect } from 'expo-router';

import type { ComponentGallery as Screen } from '@/features/dev/ComponentGallery';

// Dev-only. In production builds __DEV__ is false: Metro folds the branch away, so the gallery's code
// is not bundled (checked by `npm run check:dev-routes`), and the root layout's guard hides the route.
const Components: typeof Screen | (() => React.JSX.Element) = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/features/dev/ComponentGallery').ComponentGallery
  : () => <Redirect href="/" />;

export default Components;
