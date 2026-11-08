import { startTour } from './tourStore';

/** "Revoir la visite": back to the level (the tour points at its header), then the tour starts once the panel has slid away. */
export function replayTour(router: { dismissTo: (href: '/') => void }): void {
  router.dismissTo('/');
  setTimeout(startTour, 600);
}
