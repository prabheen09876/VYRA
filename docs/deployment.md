# HTTPS deployment

Physical-device capture needs a trusted HTTPS page. Local JavaScript bundle exports cannot establish embedded camera support.

## Cloudflare service

The initial `apps/worker/wrangler.jsonc` deliberately has a placeholder D1 ID and remote AI disabled. From `apps/worker`, using the root-installed Wrangler:

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler d1 create vyra
```

Copy the returned database ID into the `DB` binding in `wrangler.jsonc`. Retain the SQLite Durable Object migrations. If the account already has a VYRA database, use that ID instead of creating a duplicate.

Set `CORS_ORIGINS` to the exact web preview/app origins you intend to allow. Native React Native API calls do not need a browser Origin. The capture iframe additionally checks its parent origin: for a cross-origin hosted web app, set `VITE_PARENT_ORIGINS` to that exact HTTPS origin while building capture. Do not use wildcard origins.

From the root, prepare the actual model/WASM/static assets:

```powershell
npm run model:download
npm run build:capture
npm run worker:types
npm run typecheck
npm test
```

Then, from `apps/worker`:

```powershell
npx wrangler d1 migrations apply vyra --remote
npx wrangler deploy
```

Use the returned HTTPS address as the mobile server URL. Verify `/api/health`, `/capture/`, `/models/pose_landmarker_lite.task`, and the capture page's local WASM requests. Test two independent guest identities on two physical devices. Deploy between matches because a deployment may interrupt active sockets.

## Workers AI

After checking that the account has free allocation available, change `AI_ENABLED` to `"true"` in `wrangler.jsonc`. The default `dev` command uses `wrangler.local.jsonc`, which deliberately omits the unsupported local AI binding and remains in fallback mode. For remote AI during local development, also set `ai.remote` to `true` in the main config and explicitly run `npx wrangler dev --config wrangler.jsonc --port 8787` from the Worker directory. Do not add `--local` to that remote-binding workflow. The binding's `remote` option concerns development, while `AI_ENABLED` controls whether the application calls AI.

The model is `@cf/meta/llama-3.2-3b-instruct`. AI chooses one shared duration template and a short reason. It cannot grant rewards, modify damage or introduce exercises. Invalid output, errors or the 2.5-second deadline use Balanced. A timed-out remote inference can still consume quota even though the app ignores its late result. No local install or smoke test needs remote AI.

Do not enable paid usage or upgrade plans as an implied part of setup. Check current free allocations in the account dashboard. D1/DO quota failures must remain visible service failures, rather than silently inventing a local result.

## Native devices

The main app uses Expo SDK 57 and Expo Go-compatible modules. Match Expo Go to the selected SDK before the demo. The capture surface is a WebView, with MediaPipe WASM running inside it; Expo Go supporting WebView does not guarantee embedded camera/WASM compatibility.

If Android WebView capture fails, follow the separate SDK 54 native preparation instructions in `apps/capture/README.md`. The default snapshot tests native capture and shared inference; `--game` copies the complete mobile game and replaces capture with the native adapter. Both need Android SDK/JDK tooling and a development build, and remain isolated from the Expo Go dependencies. Regenerate into a fresh directory after source changes. If Apple WebView capture fails, native Apple support requires the later signing/device milestone.

No deployed URL, provisioned cloud database, mobile installation or physical-device pass should be inferred from the presence of these commands.
