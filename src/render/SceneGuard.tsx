import { Component, useEffect, type ReactNode } from 'react';

import { t } from '@/i18n';
import { track } from '@/services/analytics';
import { showToast } from '@/services/toast';

/**
 * What happens when the scene of a level fails. In a release build the player never sees a red screen: the level is loaded again
 * ("Oups, on recharge le niveau"), and the error is sent to crash tracking. Two nets are needed because React only catches the
 * errors of rendering (SceneErrorBoundary); an error thrown in the frame loop of the 3D scene (a `useFrame`) is not caught by a
 * boundary, it is an uncaught error of the app (useFrameErrorGuard).
 */

/** Sends an error to crash tracking (the analytics provider for now; plug the crash SDK in here, and nowhere else). */
export function reportSceneError(error: unknown, where: string): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  track('scene_error', { where, message: message.slice(0, 200) });
  console.warn(`[scene] ${where}:`, error);
}

type BoundaryProps = { children: ReactNode; onError: () => void };

/** Catches the errors of rendering below it and asks for the level to be loaded again. */
export class SceneErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportSceneError(error, 'render');
    showToast(t('game.reloading'));
    // The same frame cannot be drawn again: the parent rebuilds the scene (a new key) and this boundary starts afresh.
    this.props.onError();
  }

  componentDidUpdate(_: BoundaryProps, prev: { failed: boolean }) {
    if (this.state.failed && !prev.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type ErrorUtilsLike = { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };

/** At most this many reloads in a row (within RELOAD_WINDOW_MS) before the error goes on to the usual handler. */
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 15_000;

/**
 * Installs the net for the errors of the frame loop: an uncaught error reloads the level instead of ending the app with a red screen.
 * After three reloads in a few seconds the error goes to the normal handler: a level that cannot be loaded must not loop for ever.
 * Returns what puts the previous handler back.
 */
export function installFrameGuard(onError: () => void): () => void {
  const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return () => undefined;
  const previous = utils.getGlobalHandler();
  const recent: number[] = [];
  utils.setGlobalHandler((error, fatal) => {
    const now = Date.now();
    while (recent.length > 0 && now - recent[0] > RELOAD_WINDOW_MS) recent.shift();
    reportSceneError(error, 'frame');
    if (recent.length >= MAX_RELOADS) {
      previous(error, fatal);
      return;
    }
    recent.push(now);
    showToast(t('game.reloading'));
    onError();
  });
  return () => utils.setGlobalHandler(previous);
}

/**
 * While the game is on screen, the net above is in place, in a release build only (a development build keeps the red screen: that is
 * how a bug gets noticed).
 */
export function useFrameErrorGuard(onError: () => void, enabled = typeof __DEV__ === 'undefined' || !__DEV__) {
  useEffect(() => (enabled ? installFrameGuard(onError) : undefined), [onError, enabled]);
}
