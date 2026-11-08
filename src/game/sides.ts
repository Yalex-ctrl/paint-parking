import { createRng } from './rng';
import { OPPOSITE, type Dir } from './types';

/**
 * Which side of the board each level is left through, and so entered through. The side a level is left by is drawn from
 * its own number, BEFORE its maze exists, so the entry of level N+1 is known without building level N (this is what lets
 * levels generated on the phone fit the stored ones).
 *
 * Rules: never the bottom (the progression always moves forward on the screen), and never the side the level was entered
 * by (the next board would land on top of the previous one).
 */
const exits: Dir[] = [];

/** The side the ball leaves level `id` through. */
export function exitSideOf(id: number): Dir {
  if (id < 1) return 'U';
  while (exits.length < id) {
    const n = exits.length + 1;
    const entry = entrySideOf(n);
    const choices = (['U', 'L', 'R'] as Dir[]).filter((s) => s !== entry);
    const rng = createRng(n * 2654435761 + 977);
    // Up is the most common; the sideways exits make the path of the map wind.
    const weights = choices.map((s) => (s === 'U' ? 2 : 1));
    let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
    let pick = choices[choices.length - 1];
    for (let i = 0; i < choices.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        pick = choices[i];
        break;
      }
    }
    exits.push(pick);
  }
  return exits[id - 1];
}

/** The side level `id` is entered through: the opposite of the side level `id - 1` is left by. Level 1 is entered from the bottom. */
export function entrySideOf(id: number): Dir {
  return id <= 1 ? 'D' : OPPOSITE[exitSideOf(id - 1)];
}

/** Unit step (dRow, dCol) of the ball when it moves INTO a board through the given side. */
export const INWARD: Record<Dir, readonly [number, number]> = { U: [1, 0], D: [-1, 0], L: [0, 1], R: [0, -1] };
