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

// Allow bundling .glb / .gltf / .vrm 3D model files as binary assets
config.resolver.assetExts.push('glb', 'gltf', 'vrm');

module.exports = config;
