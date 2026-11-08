// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'legacy-maze/**'],
  },
  {
    // Plain Node scripts.
    files: ['scripts/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly', Buffer: 'readonly', require: 'readonly', console: 'readonly' } },
  },
  {
    // The 3D scene and the game screen are imperative by design: the ball, particles
    // and paint tiles are mutated from useFrame / a SceneBus instead of React state,
    // which is what the React Compiler lint rules below forbid. react-three-fiber's JSX
    // also uses Three.js props (args, castShadow, ...) unknown to the DOM-oriented rule.
    files: ['src/render/**/*.{ts,tsx}', 'src/core/render/**/*.{ts,tsx}', 'src/app/game.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unknown-property': 'off',
    },
  },
]);
