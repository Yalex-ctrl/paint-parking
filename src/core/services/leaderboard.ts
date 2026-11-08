/**
 * The online ranking of the daily challenge. Not built yet: this is the place where it will be, so the game already calls it with
 * the score of every challenge. For now it does nothing.
 */
export type ScoreEntry = {
  /** The day of the challenge (YYYY-MM-DD). */
  day: string;
  score: number;
  moves: number;
  seconds: number;
};

export async function submitScore(entry: ScoreEntry): Promise<void> {
  void entry;
}
