import { useLayoutEffect } from 'react';

import { benchCommit, benchRunning } from './bench';

/**
 * Times the commits of a component for the bridge bench: from the start of its render to the end of its layout effects (that is,
 * what a commit of this component costs on the JS thread). Does nothing but two clock reads when no bench is running.
 */
export function useCommitTimer(name: string): void {
  // The clock is read during the render on purpose: that is what is being measured.
  // eslint-disable-next-line react-hooks/purity
  const t0 = performance.now();
  useLayoutEffect(() => {
    if (benchRunning()) benchCommit(`commit ${name}`, performance.now() - t0);
  });
}
