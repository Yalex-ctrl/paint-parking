import { createContext } from 'react';
import type * as THREE from 'three';

/** What the player has equipped, and the reflection map: read by the ball and the paint inside the canvas. */
export type RenderStyle = {
  ball: string;
  paint: string;
  env: THREE.Texture | null;
};

export const RenderStyleContext = createContext<RenderStyle>({ ball: 'gold', paint: 'classic', env: null });
