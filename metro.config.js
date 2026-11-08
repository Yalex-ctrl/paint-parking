// three.js ships both a CJS and an ESM build behind a strict `exports` map.
// With Metro's package-exports resolution on (Expo's default), different
// consumers (our own `import ... from 'three'` vs @react-three/fiber's
// compiled `require('three')`) can each resolve to a *different* physical
// file, loading two separate copies of the library. Two copies means two
// separate `THREE.Object3D`/`THREE.Euler`/etc. classes, so `instanceof`
// checks inside react-three-fiber's reconciler fail against objects built
// from the "wrong" copy - that's what caused the "Multiple instances of
// Three.js being imported" warning and the cascade of rendering errors
// (`Cannot assign to read-only property 'rotation'`, etc.) that followed.
//
// Fix: force every resolution of 'three' (regardless of require/import
// style or which package is asking) to the exact same file.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const threeMainPath = require.resolve('three');
// 3D decor models (Kenney Nature Kit) are bundled as binary assets.
for (const ext of ['glb', 'gltf']) {
  if (!config.resolver.assetExts.includes(ext)) config.resolver.assetExts.push(ext);
}

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeMainPath };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
