"""Still-image building blocks: resize, palettes, quantisation and dithering.

Images are OpenCV-style BGR ``uint8`` arrays. Palettes are ``(K, 3)`` BGR
``uint8`` arrays. Colour distances are measured in CIELAB.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

import cv2
import numpy as np
from sklearn.cluster import MiniBatchKMeans

from .palettes import PRESETS

MAX_COLORS = 64
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")


# ---------------------------------------------------------------------------
# Palettes
# ---------------------------------------------------------------------------

def hex_to_bgr(value: str) -> Tuple[int, int, int]:
    m = _HEX.match(value.strip())
    if not m:
        raise ValueError(f"Invalid hex colour: {value!r}")
    n = int(m.group(1), 16)
    return (n & 255, (n >> 8) & 255, (n >> 16) & 255)


def bgr_to_hex(color) -> str:
    b, g, r = (int(c) for c in color)
    return f"#{r:02x}{g:02x}{b:02x}"


def parse_palette(spec: Optional[str]) -> Optional[np.ndarray]:
    """Turn a preset id or a comma-separated hex list into a BGR palette.

    Returns ``None`` when ``spec`` is empty (meaning "derive one with k-means").
    """
    if spec is None or not spec.strip():
        return None
    key = spec.strip().lower()
    hexes = PRESETS.get(key) or [h for h in re.split(r"[,\s]+", spec) if h]
    colors = []
    for h in hexes:
        bgr = hex_to_bgr(h)
        if bgr not in colors:
            colors.append(bgr)
    if len(colors) < 2:
        raise ValueError("A palette needs at least two colours")
    if len(colors) > MAX_COLORS:
        raise ValueError(f"A palette can have at most {MAX_COLORS} colours")
    return np.array(colors, dtype=np.uint8)


def to_lab(bgr: np.ndarray) -> np.ndarray:
    """BGR uint8 (..., 3) → float32 CIELAB (L in 0..100)."""
    shape = bgr.shape
    flat = bgr.reshape(-1, 1, 3).astype(np.float32) / 255.0
    return cv2.cvtColor(flat, cv2.COLOR_BGR2LAB).reshape(shape).astype(np.float32)


def kmeans_palette(pixels_bgr: np.ndarray, k: int = 8, seed: int = 0, max_samples: int = 60_000) -> np.ndarray:
    """Pick ``k`` representative colours (k-means in CIELAB), darkest first."""
    px = pixels_bgr.reshape(-1, 3)
    if len(px) == 0:
        raise ValueError("No pixels to build a palette from")
    rng = np.random.default_rng(seed)
    if len(px) > max_samples:
        px = px[rng.choice(len(px), max_samples, replace=False)]
    unique = np.unique(px, axis=0)
    k = int(max(1, min(k, len(unique))))
    if len(unique) <= k:
        centers = unique.astype(np.uint8)
    else:
        lab = to_lab(px)
        km = MiniBatchKMeans(n_clusters=k, batch_size=4096, n_init=3, random_state=seed)
        km.fit(lab)
        c = km.cluster_centers_.astype(np.float32).reshape(-1, 1, 3)
        centers = np.clip(cv2.cvtColor(c, cv2.COLOR_LAB2BGR) * 255.0 + 0.5, 0, 255).astype(np.uint8).reshape(-1, 3)
        centers = np.unique(centers, axis=0)
    order = np.argsort(to_lab(centers)[:, 0])
    return centers[order]


# ---------------------------------------------------------------------------
# Resize
# ---------------------------------------------------------------------------

def output_size(width: int, height: int, target_width: int) -> Tuple[int, int]:
    w = int(max(1, min(target_width, width)))
    h = int(max(1, round(w * height / width)))
    return w, h


def downsample_image(image: np.ndarray, target_width: int) -> np.ndarray:
    """Area-average down to ``target_width`` (keeps aspect, never upscales)."""
    h, w = image.shape[:2]
    ow, oh = output_size(w, h, target_width)
    if (ow, oh) == (w, h):
        return image.copy()
    return cv2.resize(image, (ow, oh), interpolation=cv2.INTER_AREA)


def upscale(image: np.ndarray, scale: int) -> np.ndarray:
    if scale <= 1:
        return image
    h, w = image.shape[:2]
    return cv2.resize(image, (w * scale, h * scale), interpolation=cv2.INTER_NEAREST)


# ---------------------------------------------------------------------------
# Quantisation
# ---------------------------------------------------------------------------

def nearest_indices(lab: np.ndarray, palette_lab: np.ndarray) -> np.ndarray:
    """Index of the nearest palette colour for every pixel (any leading shape)."""
    flat = lab.reshape(-1, 3)
    out = np.empty(len(flat), dtype=np.int32)
    step = 65_536
    for i in range(0, len(flat), step):
        chunk = flat[i:i + step, None, :] - palette_lab[None, :, :]
        out[i:i + step] = np.einsum("ijk,ijk->ij", chunk, chunk).argmin(axis=1)
    return out.reshape(lab.shape[:-1])


def bayer_matrix(n: int) -> np.ndarray:
    """Normalised Bayer threshold matrix of size n×n (n a power of two), values in (0, 1)."""
    m = np.zeros((1, 1), dtype=np.float32)
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return (m + 0.5) / (n * n)


def dither_spread(palette_size: int, strength: float) -> float:
    """How far (in 0..255 units) an ordered-dither offset may push a colour."""
    return 255.0 * strength * min(1.0, 1.2 / np.cbrt(palette_size))


def ordered_offset(height: int, width: int, palette_size: int, strength: float, n: int = 4) -> np.ndarray:
    tile = bayer_matrix(n) - 0.5
    reps = (int(np.ceil(height / n)), int(np.ceil(width / n)))
    return np.tile(tile, reps)[:height, :width, None] * dither_spread(palette_size, strength)


def bgr_to_oklab(bgr: np.ndarray) -> np.ndarray:
    """BGR uint8 (..., 3) → Oklab float64 (..., 3). https://bottosson.github.io/posts/oklab/"""
    c = bgr[..., ::-1].astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    m2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    return np.cbrt(lin @ m1.T) @ m2.T


# Lightness is diffused on V = L^(3/2.2): back on an sRGB-like curve, so a 50%
# grey dithers to ~50% white (same as client/src/lib/dither.ts).
V_GAMMA = 3 / 2.2


def floyd_steinberg(image: np.ndarray, palette: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """Serpentine Floyd–Steinberg error diffusion. Returns palette indices.

    Error is diffused in an Oklab-based space (V, a, b) and each working colour
    is clamped into the palette's range first, so error the palette can never
    pay back (e.g. blue with Game Boy greens) can't snowball into smears.
    """
    h, w = image.shape[:2]
    lab = bgr_to_oklab(image)
    lab[..., 0] = np.maximum(lab[..., 0], 0) ** V_GAMMA
    plab = bgr_to_oklab(palette)
    pv = plab.copy()
    pv[:, 0] = np.maximum(pv[:, 0], 0) ** V_GAMMA
    lo = pv.min(axis=0).tolist()
    hi = pv.max(axis=0).tolist()
    pal_match = [(float(a), float(b), float(c)) for a, b, c in plab]
    pal_v = [(float(a), float(b), float(c)) for a, b, c in pv]
    inv = 1.0 / V_GAMMA
    work = lab.tolist()
    idx = [[0] * w for _ in range(h)]
    taps = ((1, 0, 7 / 16), (-1, 1, 3 / 16), (0, 1, 5 / 16), (1, 1, 1 / 16))

    for y in range(h):
        ltr = y % 2 == 0
        for xi in range(w):
            x = xi if ltr else w - 1 - xi
            v, a, b = (mn if c < mn else mx if c > mx else c for c, mn, mx in zip(work[y][x], lo, hi))
            L = v ** inv if v > 0 else 0.0
            best, best_d = 0, float("inf")
            for k, (pl, pa, pb) in enumerate(pal_match):
                d = (L - pl) ** 2 + (a - pa) ** 2 + (b - pb) ** 2
                if d < best_d:
                    best, best_d = k, d
            idx[y][x] = best
            qv, qa, qb = pal_v[best]
            ev, ea, eb = (v - qv) * strength, (a - qa) * strength, (b - qb) * strength
            for dx, dy, wt in taps:
                nx = x + (dx if ltr else -dx)
                ny = y + dy
                if 0 <= nx < w and ny < h:
                    cell = work[ny][nx]
                    cell[0] += ev * wt
                    cell[1] += ea * wt
                    cell[2] += eb * wt
    return np.array(idx, dtype=np.int32)


def quantize_indices(image: np.ndarray, palette: np.ndarray, dither: str = "none", strength: float = 1.0) -> np.ndarray:
    """Map a BGR image to palette indices with the chosen dither."""
    if dither == "floyd":
        return floyd_steinberg(image, palette, strength)
    pal_lab = to_lab(palette)
    if dither == "bayer4":
        h, w = image.shape[:2]
        shifted = np.clip(image.astype(np.float32) + ordered_offset(h, w, len(palette), strength), 0, 255)
        return nearest_indices(to_lab(shifted.astype(np.uint8)), pal_lab)
    if dither != "none":
        raise ValueError(f"Unknown dither mode: {dither}")
    return nearest_indices(to_lab(image), pal_lab)


def quantize_image_kmeans(image: np.ndarray, k: int = 8) -> np.ndarray:
    """Reduce an image to its own ``k`` best colours (no dithering)."""
    palette = kmeans_palette(image, k)
    return palette[quantize_indices(image, palette)]


def pixelate(
    image: np.ndarray,
    width: int = 160,
    palette: Optional[np.ndarray] = None,
    colors: int = 16,
    dither: str = "none",
    strength: float = 1.0,
    scale: int = 1,
) -> Tuple[np.ndarray, np.ndarray]:
    """Full still-image pipeline. Accepts BGR or BGRA; returns (image, palette).

    Transparent pixels (alpha < 128) stay transparent in the output.
    """
    alpha = None
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif image.shape[2] == 4:
        small_a = downsample_image(image, width)
        alpha = np.where(small_a[..., 3] >= 128, 255, 0).astype(np.uint8)
        image = image[..., :3]

    small = downsample_image(image, width)
    if palette is None:
        opaque = small[alpha > 0] if alpha is not None and alpha.any() else small
        palette = kmeans_palette(opaque, colors)
    out = palette[quantize_indices(small, palette, dither, strength)]
    if alpha is not None:
        out = np.dstack([out, alpha])
    return upscale(out, scale), palette
