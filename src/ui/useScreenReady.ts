import { useEffect } from 'react';

import { markReady } from './loadingStore';

/** For a screen without 3D: it is ready as soon as it has mounted (the loading screen can leave). */
export function useScreenReady(route: string) {
  useEffect(() => {
    const id = setTimeout(() => markReady(route), 60);
    return () => clearTimeout(id);
  }, [route]);
}
