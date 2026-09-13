# Render camera / rep server

The website and API stay at `https://vyra.admin-dashboard-346samy.workers.dev`.
Only the YOLO pose server runs on Render. It requires a **Web Service** because
the capture page connects to a public WebSocket. A Background Worker cannot
receive these browser connections.

## Create the service

Use **New > Web Service > Public Git Repository** with
`https://github.com/prabheen09876/VYRA`. The other repository visible in the
Git Provider list is not this project.

| Setting | Value |
| --- | --- |
| Name | `vyra-pose` |
| Branch | `codex/render-pose-deployment` |
| Language / runtime | Docker |
| Region | Singapore (or the closest available region to the players) |
| Root Directory | `apps/pose-server` |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` |
| Docker Command | Leave blank; the Dockerfile supplies it |
| Health Check Path | `/health` |
| Automatic deploys | Off |
| Environment variable | `VYRA_POSE_ALLOWED_ORIGINS=https://vyra.admin-dashboard-346samy.workers.dev` |

The root `render.yaml` contains the same settings for Blueprint deployment.
It selects **1 CPU / 2 GB RAM (`1c-2g`), a paid plan**. Review the current price
in Render before creating it. This is a starting size for CPU inference, not a
guarantee of multiplayer capacity. Do not assume the 512 MB free plan can run
PyTorch and this model reliably; check memory and inference latency under load.
No GPU, persistent disk, API key, local `.env`, or Python virtual environment
is needed. The Docker build includes only the adapter, server, analyzers and
the bundled YOLO checkpoint.

## Verify before connecting the website

Wait for the service to be Live and copy its actual Render URL. Its hostname
may differ from its service name. Opening `https://<actual-host>/health` should
return `ok: true`, model `yolo26n-pose`, and `inferenceMode: learned`.
Opening the root URL returns 404 by design; this is the model server, not the
website. Render supplies HTTPS/WSS at its public domain and forwards to `PORT`.

Run the live smoke check using the existing local Python environment:

```powershell
& apps/pose-server/.venv/Scripts/python.exe apps/pose-server/check_hosted.py --url https://<actual-host>
```

The check verifies HTTP health, origin rejection, WebSocket readiness, and
actual YOLO inference on Ultralytics' bundled example image. It never opens
the camera. This is not a physical squat/push-up accuracy test.

## Connect the Cloudflare frontend

After that check passes, build the frontend with the real endpoint:

```powershell
$env:VYRA_DEPLOY_ORIGIN = 'https://vyra.admin-dashboard-346samy.workers.dev'
$env:VYRA_DEPLOY_POSE_URL = 'wss://<actual-host>/pose/ws'
node scripts/build-cloudflare.mjs
npm run deploy:cloudflare
```

Run these commands from the current project checkout containing the Cloudflare
production build scripts. The deployment branch contains only the pose-server
deployment additions; unrelated local UI work remains in the current checkout.

The pose URL is a **build-time** setting. Setting it only in Render's environment
does not update the website. Do not point the live website at an unverified or
guessed URL. No API database migration or Cloudflare Containers deployment is
required.

After deployment, reload Live Training, enable the camera, start a set and
check the body outline, live form metrics and completed reps. Camera frames
travel to Render over WSS and are processed in memory; they are not saved by
the server. The origin allowlist restricts browser origins, not authenticated
users. Monitor resource use before inviting a large number of players.

## References

- https://render.com/docs/web-services
- https://render.com/docs/websocket
- https://render.com/docs/docker
- https://render.com/docs/monorepo-support
- https://render.com/docs/compute-plans
