import type { Level } from './types';

/** Size of the playable area (floor bounding box); the level itself has one more wall all around. */
export const floorSize = (l: Pick<Level, 'cols' | 'rows'>) => ({ w: l.cols - 2, h: l.rows - 2 });
