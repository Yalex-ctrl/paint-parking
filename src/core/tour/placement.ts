import type { Rect } from './targets';

export type Side = 'below' | 'above' | 'right' | 'left';
export type Placement = {
  side: Side;
  /** Top-left of the bubble. */
  x: number;
  y: number;
  /** Centre of the arrow, which sits between the bubble and the element and points at it. */
  arrow: { x: number; y: number };
};

export const ARROW = 26;
const GAP = 4;

/**
 * Where the bubble of a step goes: where there is room (below, above, to the right, to the left of the element, in that order of
 * preference), centred on it, and always entirely on the screen (16 px from the edges, below the notch, above the home bar).
 */
export function placeBubble(
  target: Rect,
  bubble: { width: number; height: number },
  screen: { width: number; height: number },
  safe: { top: number; bottom: number },
  margin = 16,
  prefer?: Side,
): Placement {
  const room = {
    below: screen.height - safe.bottom - margin - (target.y + target.height),
    above: target.y - (safe.top + margin),
    right: screen.width - margin - (target.x + target.width),
    left: target.x - margin,
  };
  const needV = bubble.height + ARROW + GAP * 2;
  const needH = bubble.width + ARROW + GAP * 2;
  const fits: Record<Side, boolean> = { below: room.below >= needV, above: room.above >= needV, right: room.right >= needH, left: room.left >= needH };
  const order: Side[] = prefer ? [prefer, ...(['below', 'above', 'right', 'left'] as Side[]).filter((s) => s !== prefer)] : ['below', 'above', 'right', 'left'];
  const side = order.find((s) => fits[s]) ?? order.reduce((best, s) => (room[s] > room[best] ? s : best), 'below' as Side);

  const clampX = (x: number) => Math.max(margin, Math.min(screen.width - margin - bubble.width, x));
  const clampY = (y: number) => Math.max(safe.top + margin, Math.min(screen.height - safe.bottom - margin - bubble.height, y));
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const half = ARROW / 2;
  const arrowX = (x: number) => Math.max(x + half + 8, Math.min(x + bubble.width - half - 8, cx));
  const arrowY = (y: number) => Math.max(y + half + 8, Math.min(y + bubble.height - half - 8, cy));

  if (side === 'below') {
    const y = clampY(target.y + target.height + GAP + ARROW);
    const x = clampX(cx - bubble.width / 2);
    return { side, x, y, arrow: { x: arrowX(x), y: y - GAP - half } };
  }
  if (side === 'above') {
    const y = clampY(target.y - GAP - ARROW - bubble.height);
    const x = clampX(cx - bubble.width / 2);
    return { side, x, y, arrow: { x: arrowX(x), y: y + bubble.height + GAP + half } };
  }
  if (side === 'right') {
    const x = clampX(target.x + target.width + GAP + ARROW);
    const y = clampY(cy - bubble.height / 2);
    return { side, x, y, arrow: { x: x - GAP - half, y: arrowY(y) } };
  }
  const x = clampX(target.x - GAP - ARROW - bubble.width);
  const y = clampY(cy - bubble.height / 2);
  return { side, x, y, arrow: { x: x + bubble.width + GAP + half, y: arrowY(y) } };
}
