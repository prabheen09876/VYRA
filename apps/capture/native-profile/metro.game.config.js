const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
config.watchFolders = [];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];
// Nested package dependencies (for example RN's virtualized-lists) must remain resolvable.
config.resolver.disableHierarchicalLookup = false;
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'glb', 'gltf'])];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fiber9.3 supports React19.1 but still uses the file-system API moved to /legacy in Expo54.
  const nativeFiber = /[\\/]@react-three[\\/]fiber[\\/]/.test(context.originModulePath);
  const requested = nativeFiber && moduleName === 'expo-file-system' ? 'expo-file-system/legacy' : moduleName;
  const resolved = context.resolveRequest(context, requested, platform);
  const paths = resolved.type === 'sourceFile' ? [resolved.filePath] : resolved.type === 'assetFiles' ? resolved.filePaths : [];
  for (const filePath of paths) {
    const within = path.relative(__dirname, filePath);
    if (within === '..' || within.startsWith('..' + path.sep) || path.isAbsolute(within)) {
      throw new Error(`Native profile cannot import an ancestor project's SDK dependency: ${filePath}`);
    }
  }
  return resolved;
};
module.exports = config;
