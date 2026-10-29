# Mozzaic: technical guide

Mozzaic treats pixel art as a reconstruction problem rather than "resize and posterise". There are three sub-problems:

- **Spatial discretisation:** choose what each art pixel should be.
- **Colour quantisation:** pick colours from a small palette without losing form.
- **Temporal consistency (video):** stop pixels from flickering between palette colours from one frame to the next.

## 1. Web app

React 19, TypeScript and Vite. All image work happens in WebGL2 or in plain TypeScript on the main thread. No pixels leave the device unless you choose a server render.

### 1.1 Render pipeline (`client/src/lib/renderer.ts`)

Three passes, each a single full-screen triangle:

| Pass | Shader | Output | Notes |
|---|---|---|---|
| Prep | `prep.frag` | art-size RGBA8 texture | 4×4 taps per art pixel on mip level `log2(sourcePxPerArtPx / 4)` (an area filter), plus rotation, mirroring and tone |
| Quantise | `quantize.frag` | art-size RGBA8 texture | Palette match in Oklab with an optional ordered-dither offset, or per-channel levels |
| Display | `display.frag` | canvas | Nearest-neighbour upscale, zoom and pan, before/after split, grid, alpha checkerboard |

All art textures store row 0 as the **top** row, so `readPixels` returns rows in the same order as `ImageData` and exports need no flipping.

The renderer redraws only when something changes. Live sources (video, webcam, the animated sample) and recordings force a draw every frame.

### 1.2 Colour matching

Every palette colour is converted to Oklab once on the CPU and uploaded as a uniform array of up to 64 colours. The shader converts each pixel to Oklab and takes the nearest entry. Oklab distances follow perceived difference much better than RGB. In RGB, a dark blue can look "closest" to black when the eye clearly sees it as blue.

### 1.3 Ordered dithering

Bayer thresholds are computed rather than stored in a table:

```
v = 0
for k in 0..bits-1:
    x = (px >> k) & 1;  y = (py >> k) & 1
    v = v * 4 + (2 * (x ^ y) + y)
threshold = (v + 0.5) / 4^bits        // bits = 1, 2, 3 → 2×2, 4×4, 8×8
```

The colour is shifted by `(threshold − 0.5) × spread` before matching. `spread` scales with how far apart the palette colours are (`min(1, 1.2 / ∛n)` for `n` colours), so the same strength looks similar with a 2-colour or a 32-colour palette. "Noise" uses interleaved gradient noise (Jimenez 2014), which spreads more evenly than white noise.

### 1.4 Error diffusion (`client/src/lib/dither.ts`)

Floyd–Steinberg, Atkinson and Sierra Lite run on the CPU over the prep texture, with a serpentine scan. Two details make them behave with small palettes:

- **The error lives in an Oklab-based space** `(V, a, b)` with `V = L^(3/2.2)`. Diffusing Oklab hue (`a`, `b`) keeps hue, not raw RGB channel sums. Putting lightness back on an sRGB-like curve makes a 50 % grey dither to about 50 % white, which is what people expect.
- **Working colours are clamped to the palette's range** before matching and before the error is computed. Without this, error a palette can never pay back keeps growing, for example blue in an all-green Game Boy palette, or shadows darker than its darkest colour. It eventually smears whole regions into the wrong colour.

The server's `floyd_steinberg` implements the same algorithm, and both have regression tests for it.

### 1.5 Adaptive palettes (`client/src/lib/kmeans.ts`)

k-means++ seeding and Lloyd iterations in Oklab, over up to 12k pixels sampled from the **prep** texture, so tone adjustments are included. A seeded PRNG keeps the result deterministic. Live sources are only re-sampled on request, so the palette doesn't jump every frame.

### 1.6 Export (`client/src/lib/export.ts`)

- **PNG:** reads the quantised art pixels, writes them into a canvas with `putImageData`, then scales by an integer factor with smoothing off.
- **Recording:** an offscreen canvas is repainted on every renderer frame and captured with `MediaRecorder` (VP9 → VP8 → WebM → MP4, whichever is supported). Video sources record exactly one loop. Output is capped near 1080p so encoders cope.

## 2. Backend

Python 3.11+, FastAPI, OpenCV and scikit-learn. It is optional, and the web app works without it.

### 2.1 Still images (`server/processing.py`)

`INTER_AREA` downsampling, a k-means palette in CIELAB (or a preset or custom one), then nearest-colour mapping, ordered dither or Floyd–Steinberg. Alpha is thresholded, so transparent PNGs stay transparent.

### 2.2 Stable video (`server/video.py`)

Frame-by-frame quantisation "boils": a pixel near the boundary between two palette colours flips back and forth from sensor noise alone. The stabiliser removes it in two layers:

1. **One palette per clip.** It is given, or chosen by k-means over 24 frames spread across the video. The original v1 ran k-means on every frame, so the palette itself changed from frame to frame.
2. **Motion-compensated smoothing.** For frame *t*:
   - Dense Farneback flow is computed between frames *t−1* and *t* at 2× art resolution, then scaled down. Vectors shorter than 0.35 art px count as noise.
   - The previous *smoothed* frame (in CIELAB) is warped onto frame *t*: `smooth = blend · warped + (1 − blend) · current`, with `blend = 0.85 × stability`.
   - Where the warped history disagrees with the current frame by more than ΔE 22 (occlusion, reveal or a cut), the history is ignored.
   - With no dithering, palette **indices** also get hysteresis: a pixel keeps its warped index unless the new candidate is closer by more than `8 × stability` ΔE.

Ordered dither is applied *after* smoothing, so the pattern stays fixed to the pixel grid instead of being dragged by the flow (dragging it produced diagonal smears). Output frames are written with H.264 (`avc1`) when OpenCV supports it, falling back to VP9/WebM and then MPEG-4 Part 2.

Measured on a synthetic noisy clip (σ = 8 sensor noise, moving object, 12-colour palette): the share of pixels that change palette index between frames drops from 7.9 % to 0.47 % at the default stability without dithering, and to 3.6 % with Bayer 4×4.

### 2.3 Safety

- Uploads are streamed to a fresh temp directory under a fixed server-chosen name. The client's filename never touches the filesystem, and the download name is sanitised.
- Size limit `MOZZAIC_MAX_UPLOAD_MB` (default 200) is enforced while streaming.
- CPU-heavy work runs in a thread pool, so the event loop stays responsive.
- Temp files are deleted after the response is sent.
- CORS origins are configurable with `MOZZAIC_CORS_ORIGINS`. Private Network Access preflights are allowed, so the hosted app can talk to a server on `localhost`.

## 3. Tests

- `client/src/lib/*.test.ts` (Vitest): colour conversion round-trips, Oklab matching, palette import and export, k-means determinism, error-diffusion properties.
- `server/tests` (pytest): palette parsing, quantisation invariants, Bayer matrix, alpha handling, stabiliser flicker reduction, end-to-end video render, and the API (including path-traversal filenames and PNA preflight).
