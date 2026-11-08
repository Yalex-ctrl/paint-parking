import { EXIT_SPEED, HANDOFF_DISTANCE } from '../src/render/exitPhysics';
import { BRIDGE_LENGTH, CROSSING_SECONDS } from '../src/render/transition';

describe('rolling out of the exit', () => {
  it('the ball rolls onto the bridge at a pace that gets it across within the crossing time', () => {
    const rollOut = (1 - HANDOFF_DISTANCE) / EXIT_SPEED; // from the handoff to the outer face of the exit cell
    expect(rollOut).toBeLessThan(CROSSING_SECONDS / 2);
    expect(EXIT_SPEED).toBeGreaterThan(0);
    expect(BRIDGE_LENGTH + 1).toBeGreaterThan(HANDOFF_DISTANCE);
  });
});
