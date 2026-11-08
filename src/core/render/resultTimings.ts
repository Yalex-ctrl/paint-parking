// Quick: the whole result has to be over before the ball reaches the next board (the crossing takes 1.8 s).
export const STAR_FIRST_MS = 60;
export const STAR_GAP_MS = 120;
/** How long the number runs from 0 to the score (see config/scoring.ts: countSeconds), and the time the result fades out in. */
export const SCORE_COUNT_MS = 800;
export const RESULT_FADE_MS = 220;

/**
 * When things happen in the result of a level (ms after it appears): the stars, then the score runs up, then the coins won show and
 * fly to the counter, then the whole thing fades out (RESULT_FADE_MS) before the ball reaches the next board.
 */
export function resultTimings(stars: number) {
  const starsDone = STAR_FIRST_MS + stars * STAR_GAP_MS;
  const scoreAt = starsDone - 100;
  const scoreEnd = scoreAt + SCORE_COUNT_MS;
  const gainAt = scoreEnd + 40;
  const flyAt = gainAt + 260;
  return { scoreAt, scoreEnd, gainAt, flyAt, endAt: flyAt + 60 };
}
