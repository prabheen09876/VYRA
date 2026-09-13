"""Check a hosted pose server with a bundled sample image, without camera access."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import urlopen

from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

DEFAULT_ORIGIN = "https://vyra.admin-dashboard-346samy.workers.dev"


def check_http(base):
    with urlopen(base + "/health", timeout=60) as response:
        health = json.load(response)
        assert response.status == 200 and health.get("ok") is True, health
        assert health.get("model") == "yolo26n-pose", health
    try:
        urlopen(base + "/not-a-route", timeout=15)
    except HTTPError as error:
        assert error.code == 404, error.code
    else:
        raise AssertionError("Unknown routes should return 404")
    print("PASS health: model loaded; unknown routes return 404", flush=True)


async def check_socket(base, origin, payload):
    ws_url = ("wss" if base.startswith("https:") else "ws") + base[base.index(":"):] + "/pose/ws"
    for rejected_origin in (None, "https://not-vyra.example"):
        try:
            async with connect(ws_url, origin=rejected_origin, open_timeout=30):
                raise AssertionError("Unapproved origin was accepted")
        except InvalidStatus as error:
            assert error.response.status_code == 403, error.response.status_code
    print("PASS origin restrictions", flush=True)

    async with connect(ws_url, origin=origin, open_timeout=60, max_size=8 * 1024 * 1024) as socket:
        ready = json.loads(await asyncio.wait_for(socket.recv(), 30))
        assert ready.get("type") == "ready" and ready.get("inferenceMode") == "learned", ready
        await socket.send(json.dumps({"type": "configure", "exercise": "squat", "enabled": False, "reset": True}))
        await socket.send(payload)
        result = json.loads(await asyncio.wait_for(socket.recv(), 60))
        assert result.get("type") == "result", result
        assert result.get("person") is True and len(result.get("keypoints", [])) == 17, result
        assert result.get("reps") == 0 and result.get("repCompleted") is False, result
        assert result.get("inferenceMs", 0) > 0, result
        print(f"PASS real YOLO inference: 17 keypoints, {result['inferenceMs']} ms; practice counting disabled", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Actual HTTPS service URL (or local HTTP URL)")
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--image", type=Path, help="Optional test photo containing a full person")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    parsed = urlsplit(base)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        parser.error("Use the service origin without a path, query, or fragment")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        parser.error("Public services must use HTTPS")
    image = args.image
    if image is None:
        from importlib.util import find_spec
        spec = find_spec("ultralytics")
        if spec is None or spec.origin is None:
            parser.error("Install the pose requirements or provide --image")
        image = Path(spec.origin).parent / "assets" / "bus.jpg"
    payload = image.read_bytes()
    check_http(base)
    asyncio.run(check_socket(base, args.origin, payload))


if __name__ == "__main__":
    main()
