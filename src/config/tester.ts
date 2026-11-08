/**
 * The tester tools ("Outils de test"): the grid of every level, the list of the 366 challenges, the showcase, the free camera, the
 * bench of the bridge, the economy and subscription switches, the clock. They are on in a development build (`__DEV__`) and in the
 * builds made with EXPO_PUBLIC_TESTER_TOOLS=true (the `development` and `preview` profiles of eas.json: those are the builds a tester
 * plays, optimised, where `__DEV__` is false). The `production` profile sets it to "false", and a test fails if it ever does not
 * (__tests__/tester.test.ts): a player never sees any of this.
 */
const FLAG = process.env.EXPO_PUBLIC_TESTER_TOOLS === 'true';

export const TESTER_FLAG = FLAG;

/** True when the tools are available in this build. */
export const testerTools = (): boolean => (typeof __DEV__ !== 'undefined' && __DEV__) || FLAG;
