import os

import cv2
import numpy as np
import pytest


def make_video(path: str, frames: int = 24, size=(96, 64), fps: int = 12, noise: float = 6.0, seed: int = 0) -> str:
    """Gradient background with a moving square plus sensor-like noise."""
    rng = np.random.default_rng(seed)
    w, h = size
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    assert writer.isOpened()
    grad = np.tile(np.linspace(40, 220, w, dtype=np.float32), (h, 1))
    for i in range(frames):
        frame = np.dstack([grad, grad[:, ::-1], np.full_like(grad, 120)])
        x = 8 + i * 2
        frame[20:44, x:x + 20] = (30, 200, 255)
        frame = frame + rng.normal(0, noise, frame.shape)
        writer.write(np.clip(frame, 0, 255).astype(np.uint8))
    writer.release()
    return path


@pytest.fixture
def sample_video(tmp_path):
    return make_video(os.path.join(tmp_path, "clip.mp4"))
