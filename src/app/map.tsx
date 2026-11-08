import { Redirect } from 'expo-router';

import { features } from '@/config/app';

/**
 * The map of the levels is put aside (config/app.ts, features.levelMap). Its screen is only loaded when it is switched on, so
 * nothing of it (scenery, scenes, code) is read at start-up.
 */
export default function MapRoute() {
  if (!features.levelMap) return <Redirect href="/" />;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the map is switched on
  const MapScreen = require('@/screens/MapScreen').default as () => React.JSX.Element;
  return <MapScreen />;
}
