# Movement capture

This is a camera/inference surface for VYRA's React Native game. It runs MediaPipe Pose Landmarker Lite locally in a browser/WebView. Game navigation and networking remain in React Native. This is **hybrid inference inside Expo Go**, not a native MediaPipe module or a separately signed iOS application.

The hosted route is `/capture/`; the consenting-team dataset recorder is `/capture/?lab=1`. Local development uses port 5174. Camera access works on HTTPS or the device's own localhost. A phone opening a computer's ordinary HTTP LAN address does not have a secure camera context.

## Build and assets

Run the workspace install from the repository root, then `npm run build:capture`. The output is `apps/capture/dist`, intended to be mounted at `/capture/`. The build copies the installed `@mediapipe/tasks-vision` package's WASM files into `dist/wasm`; inference does not load a remote JS/WASM CDN.

The Worker asset root must contain:

```text
/capture/                         built capture page and /capture/wasm/
/models/pose_landmarker_lite.task downloaded official Google pose model
/models/movement-stage.json       optional actual team-trained model
```

The pose download is an explicit operation, never an install hook:

```powershell
node apps/capture/scripts/download-pose-model.mjs --output <asset-root>/models/pose_landmarker_lite.task
```

The script fetches Google's versioned Lite model URL and writes its SHA-256 alongside it. `npm run dev:capture` copies local WASM into the development public directory. For local model paths, the query parameters `poseModel=/capture/models/pose_landmarker_lite.task` and `model=/capture/models/movement-stage.json` can override asset locations. A missing stage model keeps the UI in **Geometric baseline** mode. Invalid models and `synthetic-test` artifacts also remain in baseline mode; they are never presented as team-trained inference.

## Bridge and phase gating

The exact shared `CaptureMessage` and `CaptureControl` types are in `@vyra/core`. In a native WebView, outgoing messages use `window.ReactNativeWebView.postMessage(JSON.stringify(message))`. Inject a control using:

```ts
webView.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(JSON.stringify(control))} })); true;`);
```

For a web iframe, set `allow="camera"`, use the trusted HTTPS capture URL, and send controls with `iframe.contentWindow.postMessage(control, captureOrigin)`. The capture page accepts messages only from its parent window and the actual embedding referrer's origin. Same-origin embedding and local loopback development are supported by default; other HTTPS app origins must be listed in the comma-separated build variable `VITE_PARENT_ORIGINS`. `parentOrigin` is optional, but if supplied must match the referrer and allowlist; it cannot select an arbitrary third-party origin. A cross-origin parent with a `no-referrer` policy is intentionally rejected; serve a suitable origin-only referrer policy. No wildcard postMessage target is used.

Send `reset: true` on every new phase, interruption, and exercise change; use `enabled: false` outside active exercise phases. The counter requires stable top → bottom → top positions, sufficient visibility/confidence, and monotonic recent frames. Disabled controls, tracking loss, a different exercise, stale frames, and resets disarm partial cycles. Only completed cycles emit `capture.rep`. The parent remains responsible for tagging the rep with its current phase ID and sequence number; the server must validate that phase and receipt time.

An embedded capture page makes one camera-start attempt on its first valid configure command while visible, so navigation from calibration to battle can reuse an already granted permission without another unnecessary prompt. Camera/browser permissions still apply, and failures retain the Enable camera button. It never automatically retries after backgrounding or stopping; standalone capture always starts with a tap.

The displayed tracking rate is measured from actual inference completion samples. No target rate is shown as an observed benchmark. `formScore` is a limited geometric range/alignment cue, not a medical evaluation or trained form-quality model.

## Required physical-device validation

No camera performance, rep-count accuracy, iPad compatibility, or real model quality is claimed by the automated tests. Before a live demo, use the actual iPad and Android phone to verify camera permission, inline video, local WASM/model loading, front-camera mirroring, and several minutes of real movement. Test permission denial, leaving the frame, partial reps, a reset at the bottom, phase/exercise changes, and background/resume. Check observed rate and memory/heat. Capture pauses and releases the camera when hidden; resuming requires a tap and fresh calibration.

## Native adapter migration

`PoseAdapter` in `packages/core/src/pose.ts` is the isolated native integration boundary: a native module produces 33 normalized **unmirrored** landmarks, frame width/height, and a monotonic timestamp. Call `assessPose` for the active exercise, and pass its selected `side` to `extractPoseFeatures`. Reuse `validateStageModel`, `predictMovementStage`, and `CompleteCycleCounter` unchanged. Use the same Lite model and model artifact, then repeat coordinate/parity/device checks; native and web pipelines are not automatically equivalent.

Do not import a custom MediaPipe or VisionCamera module into the Expo Go build. A separate custom development build is needed. A documented compatibility candidate is Expo 54.0.37 / React Native 0.81.5 / `react-native-mediapipe-posedetection` 0.4.0 / VisionCamera 4.7.3 / worklets-core 1.6.2, with New Architecture enabled. This combination still requires an actual build/device spike; VisionCamera v4 is no longer maintained. A later migration should select maintained versions and revalidate. A physical iOS custom build also needs the relevant Mac/signing/distribution path; this repository does not bypass it.

The concrete isolated scaffold is under `native-profile/`. `NativePoseCamera.tsx` uses the plugin's documented `usePoseDetection` / `RunningMode.LIVE_STREAM` / `frameProcessor` API and converts real result bundles into `PoseFrame`. `App.tsx` reuses the same feature extraction, trained-model validation/inference, visibility/calibration rules and full-cycle counter. The primary Expo Go entry never imports either file or its dependencies.

```powershell
node apps/capture/scripts/prepare-native-profile.mjs
Push-Location apps/capture/.native-spike
npm.cmd install --workspaces=false
npm.cmd run android -- --device
Pop-Location
```

The prepare command requires the already downloaded pose model in the Worker asset root, or an explicit `--pose-model` path. It creates a separate SDK 54 project, including a snapshot of shared core code and the model asset; it refuses to overwrite an existing project. It does not install packages or alter the primary SDK 57 app. An optional `EXPO_PUBLIC_STAGE_MODEL_URL` can point to a genuine team artifact on HTTPS; otherwise the native screen is explicitly baseline mode. The scaffold's build compatibility, native coordinate conventions and device performance remain unverified until those commands and the physical checks actually run.

For the **full native game**, use the separate game snapshot:

```powershell
node apps/capture/scripts/prepare-native-profile.mjs --game
Push-Location apps/capture/.native-game
npm.cmd install --workspaces=false
npm.cmd run typecheck
npm.cmd run export:android
npm.cmd run android -- --device
Pop-Location
```

This copies the current mobile routes, character assets, guest/session flow, solo/private battles, progression and cosmetics. It replaces the generated native `CaptureFrame.tsx` with `native-profile/GameCaptureFrame.tsx`, which consumes real `NativePoseCamera` results and emits the existing `CaptureMessage` protocol. Server connections, phase IDs and rep sequencing stay in the game. Native camera inference no longer depends on a WebView. The copied `.web.tsx` adapter still uses web capture for a browser preview.

The snapshot uses a verified SDK54 dependency matrix in `native-profile/sdk54-versions.json`, including React19.1-compatible Fiber9.3.0/Drei10.5.1. Metro and native autolinking search only the snapshot's installed dependencies. Native plugins are not added to the primary SDK57 project. Tests, build caches, installed dependencies and private `.env` files are excluded; configure the backend URL in the generated app's existing connection screen. The game adapter loads the optional genuine stage artifact from that backend's `/models/movement-stage.json` and otherwise shows geometric baseline mode. Both snapshots refuse overwrite; use `--output <fresh-directory>` after source changes.

Dependency installation, TypeScript checks and `export:android` are software checks, **not** an Android native build. `run android` requires a working Android SDK/JDK setup and a device/emulator; physical camera verification needs a real phone. There is no verified native build or device benchmark yet. For iOS, this still requires a supported Mac/signing/distribution route. Before relying on native inference, verify landmark orientation/visibility, partial-cycle rejection, phase transitions, background/resume, and the same model's output on actual devices.

Run installation from the generated directory itself. Installing with `--prefix` from the repository root added the current root package as an unwanted local dependency with the npm version tested. The generated Metro configuration allows nested dependencies but rejects resolved files outside the isolated project; it maps only Fiber9.3's old file-system import to Expo54's supported `/legacy` entry. The pose adapter follows the installed0.4 types and native serializers (`results[0].landmarks[0]`, `inputImageWidth`/`inputImageHeight`), which conflict with the package README's older example. This upstream inconsistency needs physical native verification. Missing result callbacks reset tracking after650ms without creating synthetic frames.

The adapter uses the package's `ViewCoordinator.getFrameDims` and `convertPoint` to rotate sensor coordinates into the upright camera viewport, with `contain` and `no-mirror`. Shared features receive normalized viewport coordinates and the corresponding aspect ratio. Rotation/layout changes clear tracking. This transformation must still be checked with actual front-camera movements on each target OS.

Local software validation on2026-09-11: shared pose/inference/bridge tests passed14 cases, including24 Python-to-TypeScript probability comparisons from an explicitly synthetic sklearn model (maximum absolute error4.45e-16); seven Python dataset/evaluation guard tests passed. Core and capture TypeScript checks and the capture build passed. The isolated full native game's dependency installation, TypeScript check and Android Hermes export also passed. These checks do not compile native Android/iOS code, validate camera coordinates on hardware, or establish accuracy on real participants. The Android SDK/device build and real team dataset remain required.

The isolated native profile pins PostCSS8.5.28 to address the older build-tool dependency. Expo54's transitive `image-size`1.2.1 advisory remains a limitation of this build candidate; overriding it to v2 would break Metro's synchronous filesystem-path API. This dependency status is separate from the primary app.

Compatibility sources: [Expo SDK54 bundled modules](https://github.com/expo/expo/blob/sdk-54/packages/expo/bundledNativeModules.json), [MediaPipe pose plugin source and installation](https://github.com/EndLess728/react-native-mediapipe-posedetection), [Fiber9.3.0 manifest](https://registry.npmjs.org/@react-three/fiber/9.3.0), [Drei10.5.1 manifest](https://registry.npmjs.org/@react-three/drei/10.5.1). These establish a build candidate, not a tested compatibility guarantee.
