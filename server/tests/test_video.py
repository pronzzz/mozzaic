import os

import cv2
import numpy as np
import pytest

from server.processing import downsample_image, parse_palette
from server.video import Stabilizer, process_video_stabilized, sample_palette


def _frames(path, width):
    cap = cv2.VideoCapture(path)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(downsample_image(f, width))
    cap.release()
    return out


def _flicker(index_maps):
    """Share of pixels that change palette index between consecutive frames."""
    return float(np.mean([(a != b).mean() for a, b in zip(index_maps, index_maps[1:])]))


def test_stabilizer_outputs_valid_indices(sample_video):
    pal = parse_palette("sweetie-16")
    stab = Stabilizer(pal, stability=0.6)
    for f in _frames(sample_video, 48):
        idx = stab.step(f)
        assert idx.shape == f.shape[:2]
        assert idx.min() >= 0 and idx.max() < len(pal)


def test_stability_reduces_flicker(tmp_path):
    from .conftest import make_video

    # A static, noisy scene: every index change is flicker.
    path = make_video(os.path.join(tmp_path, "static.mp4"), frames=20, noise=10.0)
    frames = _frames(path, 48)
    # Freeze the moving square so only noise varies between frames.
    frames = [frames[0].astype(np.int16) + (f.astype(np.int16) - frames[0]) * 0 + np.random.default_rng(i).normal(0, 8, f.shape).astype(np.int16)
              for i, f in enumerate(frames)]
    frames = [np.clip(f, 0, 255).astype(np.uint8) for f in frames]
    pal = parse_palette("pico-8")

    raw = Stabilizer(pal, stability=0.0)
    raw_maps = [raw.step(f) for f in frames]
    stable = Stabilizer(pal, stability=0.8)
    stable_maps = [stable.step(f) for f in frames]

    assert _flicker(stable_maps) < _flicker(raw_maps) * 0.5


def test_sample_palette(sample_video):
    pal = sample_palette(sample_video, 48, 6)
    assert 2 <= len(pal) <= 6


@pytest.mark.parametrize("dither", ["none", "bayer4"])
def test_process_video_end_to_end(sample_video, tmp_path, dither):
    res = process_video_stabilized(sample_video, os.path.join(tmp_path, "out"), target_width=48, k=8, dither=dither, scale=2)
    assert os.path.exists(res.path) and os.path.getsize(res.path) > 0
    assert res.frames == 24
    assert (res.width, res.height) == (96, 64)
    cap = cv2.VideoCapture(res.path)
    assert int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) == 96
    cap.release()


def test_process_video_rejects_garbage(tmp_path):
    bad = os.path.join(tmp_path, "bad.mp4")
    with open(bad, "wb") as f:
        f.write(b"not a video")
    with pytest.raises(ValueError):
        process_video_stabilized(bad, os.path.join(tmp_path, "out"))
