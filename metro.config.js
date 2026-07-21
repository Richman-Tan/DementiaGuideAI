const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow bundling .glb / .gltf 3D model files as binary assets
config.resolver.assetExts.push('glb', 'gltf', 'vrm');

module.exports = config;
