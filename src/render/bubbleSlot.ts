/**
 * Where a text bubble of the level (the hint for the first swipe, the explanation of a new mechanic) goes: in the free band
 * above the board or under it, never over the walls or the ball. `board` is the board's top and bottom edge (see
 * cameraFit.lotBandPx), `frame` the area between the header and the buttons. Returns the top of the bubble.
 */
export function bubbleSlot(board: { top: number; bottom: number }, frame: { top: number; bottom: number }, height: number, gap = 8): number {
  const above = board.top - frame.top;
  const below = frame.bottom - board.bottom;
  const need = height + gap * 2;
  const useAbove = above >= need || (below < need && above >= below);
  if (useAbove) return Math.max(frame.top + gap, board.top - height - gap);
  return Math.min(frame.bottom - height - gap, board.bottom + gap);
}
