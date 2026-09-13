"""Public hosting adapter for the existing YOLO model and per-player rep counters."""
from __future__ import annotations

import asyncio
from http import HTTPStatus
import json
import os
from threading import Lock

from websockets.asyncio.server import serve

from pose_engine import PoseEngine
from server import handle_connection

APP_ORIGIN = "https://vyra.admin-dashboard-346samy.workers.dev"


class SharedEngine:
    """Protect the shared CPU model; handle_connection owns each player's counters."""

    def __init__(self):
        self.engine = PoseEngine()
        self.model_version = self.engine.model_version
        self.lock = Lock()

    def infer(self, frame):
        with self.lock:
            return self.engine.infer(frame)


def request_handler(model_version, origins):
    def process_request(connection, request):
        path = request.path.split("?", 1)[0]
        if path == "/health":
            response = connection.respond(HTTPStatus.OK, json.dumps({
                "ok": True, "model": model_version, "inferenceMode": "learned",
            }) + "\n")
            response.headers["Content-Type"] = "application/json"
            response.headers["Cache-Control"] = "no-store"
            return response
        if path != "/pose/ws":
            return connection.respond(HTTPStatus.NOT_FOUND, "Not found\n")
        if request.headers.get("Origin") not in origins:
            return connection.respond(HTTPStatus.FORBIDDEN, "Origin not allowed\n")
        return None  # serve validates the WebSocket upgrade.

    return process_request


async def main():
    port = int(os.environ.get("PORT", "10000"))
    origins = {origin.strip() for origin in os.environ.get(
        "VYRA_POSE_ALLOWED_ORIGINS", APP_ORIGIN,
    ).split(",") if origin.strip()}
    if not origins:
        raise ValueError("VYRA_POSE_ALLOWED_ORIGINS must contain the website origin")

    print("[vyra-pose] loading model ...", flush=True)
    engine = SharedEngine()

    async def handler(connection):
        await handle_connection(connection, engine)

    # Health becomes available only after the checkpoint has loaded successfully.
    async with serve(
        handler, "0.0.0.0", port,
        process_request=request_handler(engine.model_version, origins),
        max_size=8 * 1024 * 1024,
        compression=None,
    ):
        print(f"[vyra-pose] ready on port {port}: {engine.model_version}", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
