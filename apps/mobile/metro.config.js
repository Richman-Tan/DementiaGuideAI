const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro only resolves files it watches, and the app now sits one level down from
// two things it imports: packages/core (via @core) and the shared .glb/.vrm models
// in assets/ (via @assets). They are listed individually on purpose — watching the
// workspace root wholesale would pull in unity-avatar/ (a multi-GB Unity Library/
// and the UaaL exports) and docs/report/, which makes the dev server crawl.
config.watchFolders = [
  path.resolve(workspaceRoot, 'packages'),
  path.resolve(workspaceRoot, 'assets'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// npm workspaces hoist most dependencies to the workspace root, so Metro has to
// look in both places. disableHierarchicalLookup stops it walking further up past
// the repo and picking something up outside it.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// One exception to the flat lookup above. Expo's URL/URLSearchParams polyfill,
// whatwg-url-without-unicode, needs webidl-conversions@5, which npm installs
// NESTED under it because the root copy is jsdom's 8.x. With hierarchical lookup
// off, Metro never sees the nested copy and bundles 8.x, which reads
// SharedArrayBuffer.prototype as soon as it loads. Hermes has no SharedArrayBuffer,
// so the first `new URL()` throws; supabase-js's createClient (run at import time
// by src/lib/supabaseService.ts) reports that as "Invalid supabaseUrl: Provided
// URL is malformed", and the app stops at a blank white screen on launch.
// Resolving this one import from the polyfill's own node_modules gives it the
// version npm installed for it; nothing else changes.
const urlPolyfillDir = path.dirname(
  require.resolve('whatwg-url-without-unicode/package.json', { paths: [projectRoot] })
);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'webidl-conversions' &&
    context.originModulePath.startsWith(urlPolyfillDir + path.sep)
  ) {
    return context.resolveRequest(
      {
        ...context,
        nodeModulesPaths: [path.join(urlPolyfillDir, 'node_modules'), ...context.nodeModulesPaths],
      },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Allow bundling .glb / .gltf / .vrm 3D model files as binary assets
config.resolver.assetExts.push('glb', 'gltf', 'vrm');

module.exports = config;
