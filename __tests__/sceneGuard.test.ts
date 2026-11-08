import { SceneErrorBoundary, installFrameGuard } from '../src/render/SceneGuard';
import { currentToast, clearToastForTests } from '../src/services/toast';
import { setAnalyticsImplementation } from '../src/services/analytics';

describe('the safety nets of the game scene', () => {
  const events: { event: string; params?: unknown }[] = [];
  beforeEach(() => {
    events.length = 0;
    clearToastForTests();
    setAnalyticsImplementation((event, params) => events.push({ event, params }));
  });

  it('a render error reloads the level, says so, and is sent to crash tracking', () => {
    const reload = jest.fn();
    const boundary = new SceneErrorBoundary({ children: null, onError: reload });
    expect(SceneErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    boundary.componentDidCatch(new TypeError("Cannot read property 'findIndex' of undefined"));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(currentToast()?.message).toMatch(/recharge le niveau/);
    expect(events).toEqual([{ event: 'scene_error', params: expect.objectContaining({ where: 'render', message: expect.stringContaining('findIndex') }) }]);
  });

  it('an error of the frame loop reloads the level; after three in a row the normal handler gets it', () => {
    const previous = jest.fn();
    let handler: (e: unknown, fatal?: boolean) => void = previous;
    (globalThis as unknown as { ErrorUtils: unknown }).ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler: (h: typeof handler) => (handler = h) };
    const reload = jest.fn();
    const uninstall = installFrameGuard(reload);
    for (let i = 0; i < 3; i++) handler(new Error('frame'), true);
    expect(reload).toHaveBeenCalledTimes(3);
    expect(previous).not.toHaveBeenCalled();
    handler(new Error('again'), true);
    expect(reload).toHaveBeenCalledTimes(3);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.event === 'scene_error')).toHaveLength(4);
    uninstall();
    expect(handler).toBe(previous);
    delete (globalThis as unknown as { ErrorUtils?: unknown }).ErrorUtils;
  });
});
