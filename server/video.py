"""Temporally stable pixel-art video.

Frame-by-frame quantisation "boils": a pixel near the boundary between two
palette colours flips back and forth from sensor noise alone. We fix it in two
steps:

1. **One palette for the whole clip.** It is fixed up front (given, or k-means
   over frames sampled across the video), so colours never re-shuffle.
2. **Motion-compensated smoothing.** Dense Farneback flow warps the previous
   (smoothed) frame onto the current one and the two are blended, so noise is
   averaged out *along* the motion instead of smearing it. Without dithering,
   palette indices also get hysteresis: a pixel keeps its warped colour unless
   the new candidate is clearly better. Occluded/revealed regions (where the
   warp doesn't match) always take the fresh frame.

The output only ever contains palette colours; nothing is blended.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Iterator, List, Optional, Tuple

import cv2
import numpy as np

from .processing import (
    downsample_image,
    kmeans_palette,
    nearest_indices,
    ordered_offset,
    output_size,
    to_lab,
    upscale,
)

# How much of the motion-compensated history is kept per frame, at stability = 1.
MAX_BLEND = 0.85
# ΔE (CIELAB) a candidate must beat the warped colour by, at stability = 1.
MAX_TOLERANCE = 8.0
# Flow vectors shorter than this (art px) are treated as noise.
MIN_MOTION = 0.35
# Above this ΔE between the warped previous frame and the current frame we
# assume occlusion and don't trust the history.
OCCLUSION_DE = 22.0

# Tried in order; the first one this OpenCV build can open wins.
CODECS: List[Tuple[str, str, str]] = [
    ("avc1", ".mp4", "video/mp4"),
    ("VP90", ".webm", "video/webm"),
    ("mp4v", ".mp4", "video/mp4"),
]


@dataclass
class VideoResult:
    path: str
    media_type: str
    frames: int
    fps: float
    width: int
    height: int
    palette: np.ndarray = field(repr=False)


def _flow(prev_gray: np.ndarray, gray: np.ndarray) -> np.ndarray:
    return cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)


class Stabilizer:
    """Stateful per-frame quantiser. Feed it art-resolution BGR frames in order.

    Two layers of stability, both motion-compensated with optical flow:

    * **Colour smoothing**: the frame's CIELAB colours are blended with the
      previous *smoothed* frame warped along the flow, so sensor noise is
      averaged out before quantisation. Ordered-dither patterns stay anchored
      to the pixel grid, as they should.
    * **Index hysteresis** (no-dither mode): a pixel keeps its warped palette
      index unless the new candidate is better by more than a ΔE tolerance.
    """

    def __init__(self, palette: np.ndarray, stability: float = 0.6, dither: str = "none"):
        if dither not in ("none", "bayer4"):
            raise ValueError("Video supports dither 'none' or 'bayer4'")
        self.palette = palette
        self.palette_lab = to_lab(palette)
        self.stability = float(np.clip(stability, 0.0, 1.0))
        self.blend = self.stability * MAX_BLEND
        self.tolerance = self.stability * MAX_TOLERANCE
        self.dither = dither
        self.prev_idx: Optional[np.ndarray] = None
        self.prev_gray: Optional[np.ndarray] = None
        self.prev_lab: Optional[np.ndarray] = None
        self._grid: Optional[Tuple[np.ndarray, np.ndarray]] = None
        self._offset: Optional[np.ndarray] = None

    def _quantize(self, lab: np.ndarray) -> np.ndarray:
        if self.dither == "bayer4":
            h, w = lab.shape[:2]
            if self._offset is None or self._offset.shape[:2] != (h, w):
                self._offset = ordered_offset(h, w, len(self.palette), 0.5)
            bgr = cv2.cvtColor(lab.astype(np.float32), cv2.COLOR_LAB2BGR) * 255.0
            shifted = np.clip(bgr + self._offset, 0, 255).astype(np.uint8)
            return nearest_indices(to_lab(shifted), self.palette_lab)
        return nearest_indices(lab, self.palette_lab)

    def _warp_maps(self, gray: np.ndarray, h: int, w: int) -> Tuple[np.ndarray, np.ndarray]:
        flow = _flow(self.prev_gray, gray)
        if flow.shape[:2] != (h, w):
            sx = w / flow.shape[1]
            sy = h / flow.shape[0]
            flow = cv2.resize(flow, (w, h), interpolation=cv2.INTER_AREA)
            flow[..., 0] *= sx
            flow[..., 1] *= sy
        # Sub-pixel jitter in flat, noisy areas is noise, not motion.
        still = np.hypot(flow[..., 0], flow[..., 1]) < MIN_MOTION
        flow[still] = 0
        if self._grid is None or self._grid[0].shape != (h, w):
            self._grid = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        gx, gy = self._grid
        # Farneback gives prev→cur motion, so pixel (x, y) now came from (x−u, y−v).
        return gx - flow[..., 0], gy - flow[..., 1]

    def step(self, frame: np.ndarray, flow_gray: Optional[np.ndarray] = None) -> np.ndarray:
        """Quantise one frame and return its palette indices (H×W int32).

        ``flow_gray`` may be a higher-resolution greyscale frame for better flow;
        by default the flow is computed on the art-resolution frame itself.
        """
        h, w = frame.shape[:2]
        lab = to_lab(frame)
        gray = flow_gray if flow_gray is not None else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.prev_lab is None or self.stability == 0:
            smooth = lab
            out = self._quantize(smooth)
        else:
            map_x, map_y = self._warp_maps(gray, h, w)
            warped_lab = cv2.remap(self.prev_lab, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            consistent = np.linalg.norm(lab - warped_lab, axis=-1) < OCCLUSION_DE
            mix = np.where(consistent, self.blend, 0.0)[..., None].astype(np.float32)
            smooth = warped_lab * mix + lab * (1.0 - mix)
            out = self._quantize(smooth)

            if self.dither == "none" and self.tolerance > 0:
                warped_idx = cv2.remap(self.prev_idx.astype(np.float32), map_x, map_y, cv2.INTER_NEAREST,
                                       borderMode=cv2.BORDER_CONSTANT, borderValue=-1).astype(np.int32)
                valid = (warped_idx >= 0) & consistent
                safe = np.where(valid, warped_idx, 0)
                d_warp = np.linalg.norm(smooth - self.palette_lab[safe], axis=-1)
                d_cand = np.linalg.norm(smooth - self.palette_lab[out], axis=-1)
                out = np.where(valid & (d_warp <= d_cand + self.tolerance), warped_idx, out).astype(np.int32)

        self.prev_idx = out
        self.prev_gray = gray
        self.prev_lab = smooth.astype(np.float32)
        return out


def _open_writer(base_path: str, fps: float, size: Tuple[int, int]) -> Tuple[cv2.VideoWriter, str, str]:
    for fourcc, ext, mime in CODECS:
        path = base_path + ext
        writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*fourcc), fps, size)
        if writer.isOpened():
            return writer, path, mime
        writer.release()
        if os.path.exists(path):
            os.remove(path)
    raise RuntimeError("No usable video encoder in this OpenCV build")


def _read_frames(cap: cv2.VideoCapture) -> Iterator[np.ndarray]:
    while True:
        ok, frame = cap.read()
        if not ok:
            return
        yield frame


def sample_palette(input_path: str, target_width: int, k: int, samples: int = 24) -> np.ndarray:
    """k-means palette from frames spread evenly across the video."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError("Could not open video")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    pixels = []
    if total > 0:
        for i in np.linspace(0, max(0, total - 1), num=min(samples, total)).astype(int):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
            ok, frame = cap.read()
            if ok:
                pixels.append(downsample_image(frame, target_width).reshape(-1, 3))
    if not pixels:  # unknown length or seeking unsupported: take the first frames
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        for frame, _ in zip(_read_frames(cap), range(samples)):
            pixels.append(downsample_image(frame, target_width).reshape(-1, 3))
    cap.release()
    if not pixels:
        raise ValueError("Video has no readable frames")
    return kmeans_palette(np.concatenate(pixels), k)


def process_video_stabilized(
    input_path: str,
    output_base: str,
    target_width: int = 160,
    palette: Optional[np.ndarray] = None,
    k: int = 16,
    stability: float = 0.6,
    dither: str = "none",
    scale: int = 4,
    max_frames: int = 3600,
) -> VideoResult:
    """Render a whole video. ``output_base`` is a path without extension."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError("Could not open video")
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    if not (0 < fps <= 240):
        fps = 30.0
    cap.release()
    if src_w <= 0 or src_h <= 0:
        raise ValueError("Video has no readable frames")

    if palette is None:
        palette = sample_palette(input_path, target_width, k)

    out_w, out_h = output_size(src_w, src_h, target_width)
    # Flow is more reliable at 2× art resolution; cheap compared to decoding.
    flow_w = min(src_w, out_w * 2)
    writer, path, mime = _open_writer(output_base, fps, (out_w * scale, out_h * scale))
    stab = Stabilizer(palette, stability, dither)

    cap = cv2.VideoCapture(input_path)
    frames = 0
    try:
        for frame in _read_frames(cap):
            if frames >= max_frames:
                break
            small = downsample_image(frame, out_w)
            if small.shape[:2] != (out_h, out_w):
                small = cv2.resize(small, (out_w, out_h), interpolation=cv2.INTER_AREA)
            flow_gray = cv2.cvtColor(downsample_image(frame, flow_w), cv2.COLOR_BGR2GRAY)
            idx = stab.step(small, flow_gray)
            writer.write(upscale(palette[idx], scale))
            frames += 1
    finally:
        cap.release()
        writer.release()

    if frames == 0:
        raise ValueError("Video has no readable frames")
    return VideoResult(path=path, media_type=mime, frames=frames, fps=fps, width=out_w * scale, height=out_h * scale, palette=palette)
