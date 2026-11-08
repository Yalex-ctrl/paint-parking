/**
 * Times how long each screen takes from the moment it is opened to its first 3D frame. In development the figure is printed
 * ("[load] map: 412 ms"); `loadTimes` keeps the last one of each screen.
 */
const started = new Map<string, number>();
export const loadTimes: Record<string, number> = {};

/** A screen was opened (call as early as possible: when the navigation starts or the screen mounts). */
export function markNavigation(screen: string) {
  started.set(screen, Date.now());
}

/** The screen has drawn its first frame. */
export function markFirstFrame(screen: string) {
  const t0 = started.get(screen);
  if (t0 === undefined) return;
  started.delete(screen);
  loadTimes[screen] = Date.now() - t0;
  if (__DEV__) console.log(`[load] ${screen}: ${loadTimes[screen]} ms to the first 3D frame`);
}
