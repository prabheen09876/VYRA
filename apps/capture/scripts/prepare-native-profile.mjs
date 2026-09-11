import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const scripts = dirname(fileURLToPath(import.meta.url));
const captureRoot = resolve(scripts, '..'), repo = resolve(captureRoot, '../..');
function argument(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
const game = process.argv.includes('--game');
const output = resolve(argument('--output', resolve(captureRoot, game ? '.native-game' : '.native-spike')));
const poseModel = resolve(argument('--pose-model', resolve(repo, 'apps/worker/public/models/pose_landmarker_lite.task')));
try { await access(output); throw new Error(`Refusing to overwrite existing native project: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await access(poseModel);
await mkdir(output, { recursive: true });
const templateRoot = resolve(captureRoot, 'native-profile');
let manifest;
const isTest = path => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
if (game) {
  const mobileRoot = resolve(repo, 'apps/mobile');
  const excluded = new Set(['node_modules', '.expo', 'dist', 'web-build', '.git', 'android', 'ios', '__tests__']);
  await cp(mobileRoot, output, { recursive: true, filter: source => {
    const parts = relative(mobileRoot, source).split(sep);
    const name = basename(source);
    return !parts.some(part => excluded.has(part)) && !isTest(name)
      && (!name.startsWith('.env') || name === '.env.example') && name !== 'package-lock.json';
  } });
  manifest = JSON.parse(await readFile(resolve(mobileRoot, 'package.json'), 'utf8'));
  const versions = JSON.parse(await readFile(resolve(templateRoot, 'sdk54-versions.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) {
    if (versions[name]) manifest.dependencies[name] = versions[name];
    else if (name.startsWith('expo') || name.startsWith('@expo/')) throw new Error(`Add a verified SDK54 pin for ${name} before preparing this snapshot`);
  }
  for (const name of ['expo-dev-client', 'expo-font', 'react-native-mediapipe-posedetection', 'react-native-vision-camera', 'react-native-worklets-core']) manifest.dependencies[name] = versions[name];
  manifest.name = 'vyra-native-game';
  manifest.scripts = { ...manifest.scripts, start: 'expo start --dev-client', dev: 'expo start --dev-client', android: 'expo run:android', 'export:android': 'expo export --platform android' };
  manifest.devDependencies = { ...manifest.devDependencies, '@types/react': '~19.1.10', '@types/node': '^22.15.0', typescript: '~5.9.2', 'babel-preset-expo': '~54.0.12' };
  manifest.expo = { autolinking: { searchPaths: ['./node_modules'] } };
  manifest.overrides = { ...manifest.overrides, postcss: '8.5.28' };
  const appConfig = JSON.parse(await readFile(resolve(output, 'app.json'), 'utf8'));
  appConfig.expo.name = 'VYRA Native Game'; appConfig.expo.slug = 'vyra-native-game'; appConfig.expo.scheme = 'vyranative'; appConfig.expo.newArchEnabled = true;
  appConfig.expo.android = { ...appConfig.expo.android, package: 'app.vyra.fitness.nativegame' };
  appConfig.expo.ios = { ...appConfig.expo.ios, bundleIdentifier: 'app.vyra.fitness.nativegame' };
  const nativeConfig = JSON.parse(await readFile(resolve(templateRoot, 'app.json'), 'utf8'));
  appConfig.expo.plugins = [...(appConfig.expo.plugins ?? []), ...nativeConfig.expo.plugins];
  await writeFile(resolve(output, 'app.json'), JSON.stringify(appConfig, null, 2) + '\n');
  await cp(resolve(templateRoot, 'GameCaptureFrame.tsx'), resolve(output, 'src/components/CaptureFrame.tsx'));
  await cp(resolve(templateRoot, 'NativePoseCamera.tsx'), resolve(output, 'src/components/NativePoseCamera.tsx'));
  // Keep Metro and autolinking on this project's SDK54 dependencies, even inside the SDK57 monorepo.
  await cp(resolve(templateRoot, 'metro.game.config.js'), resolve(output, 'metro.config.js'));
} else {
  for (const filename of ['App.tsx', 'NativePoseCamera.tsx', 'index.js', 'app.json', 'tsconfig.json']) {
    await cp(resolve(templateRoot, filename), resolve(output, filename));
  }
  manifest = JSON.parse(await readFile(resolve(templateRoot, 'package.template.json'), 'utf8'));
}
await cp(resolve(templateRoot, 'babel.config.js'), resolve(output, 'babel.config.js'));
await writeFile(resolve(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await mkdir(resolve(output, 'vendor/core'), { recursive: true });
await cp(resolve(repo, 'packages/core/src'), resolve(output, 'vendor/core/src'), { recursive: true, filter: source => !isTest(source) && basename(source) !== '__tests__' });
await cp(resolve(repo, 'packages/core/package.json'), resolve(output, 'vendor/core/package.json'));
await mkdir(resolve(output, 'assets/models'), { recursive: true });
await cp(poseModel, resolve(output, 'assets/models/pose_landmarker_lite.task'));
await writeFile(resolve(output, '.gitignore'), 'node_modules/\n.expo/\nandroid/\nios/\n');
console.log(`Prepared isolated SDK54 ${game ? 'full native game' : 'native-pose practice'} project at ${output}. The primary Expo Go app is unchanged.`);
console.log(`Install from the generated directory: cd "${output}", then npm.cmd install --workspaces=false`);
console.log(`Check: npm.cmd --prefix "${output}" run typecheck`);
if (game) console.log(`Bundle check: npm.cmd --prefix "${output}" run export:android`);
console.log(`Then: npm.cmd --prefix "${output}" run android -- --device`);
console.log('This snapshot is not a verified Android/iOS build. A JS export is not a native compile. Confirm camera coordinates and full-cycle counting on hardware.');
