import os

import cv2
import numpy as np
from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def _png(w=64, h=32, channels=3):
    img = np.random.default_rng(0).integers(0, 255, (h, w, channels), dtype=np.uint8)
    return cv2.imencode(".png", img)[1].tobytes()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_palettes():
    body = client.get("/palettes").json()
    assert body["game-boy"] == ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]


def test_extract_palette():
    r = client.post("/palette?colors=5", files={"file": ("a.png", _png(), "image/png")})
    assert r.status_code == 200
    assert 1 <= len(r.json()["colors"]) <= 5


def test_process_image_png_size_and_palette():
    r = client.post(
        "/process/image?width=16&palette=pico-8&dither=bayer4&scale=4",
        files={"file": ("a.png", _png(64, 32), "image/png")},
    )
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    img = cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_UNCHANGED)
    assert img.shape[:2] == (32, 64)
    assert len(r.headers["x-mozzaic-palette"].split(",")) == 16


def test_process_image_bad_palette_is_422():
    r = client.post("/process/image?palette=not-a-colour", files={"file": ("a.png", _png(), "image/png")})
    assert r.status_code == 422


def test_process_image_bad_file_is_400():
    r = client.post("/process/image", files={"file": ("a.png", b"hello", "image/png")})
    assert r.status_code == 400


def test_process_video(sample_video):
    with open(sample_video, "rb") as f:
        r = client.post(
            "/process/video?width=32&colors=6&scale=2",
            files={"file": ("../../etc/evil name.mp4", f, "video/mp4")},
        )
    assert r.status_code == 200
    assert r.headers["content-type"] in ("video/mp4", "video/webm")
    assert r.headers["x-mozzaic-frames"] == "24"
    # The client's path is never used on disk, and the download name is sanitised.
    assert "evilname-mozzaic" in r.headers["content-disposition"]
    assert not os.path.exists("/etc/evil name.mp4")


def test_process_video_rejects_non_video():
    r = client.post("/process/video", files={"file": ("x.mp4", b"junk", "video/mp4")})
    assert r.status_code == 400


def test_cors_private_network_preflight():
    r = client.options(
        "/process/video",
        headers={
            "Origin": "https://mozzaic.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-private-network") == "true"
