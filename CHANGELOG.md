# Changelog

## 2.0.0 (2026-10-29)

A ground-up revamp of both the web app and the backend.

### Web app
- New three-pass WebGL2 renderer: area-averaged downsampling to a true art resolution, palette matching in Oklab, nearest-neighbour display. Shaders are compiled once instead of on every slider change.
- Real palettes: PICO-8, Sweetie 16, Endesga 32, Game Boy, Pocket Grey, CGA, 1-bit, Ink & Paper, Nord, Vapor. Also adaptive k-means palettes, per-channel levels, and custom import/export (`.hex`, `.gpl`).
- Eight dither modes: Bayer 2×2 / 4×4 / 8×8 and noise on the GPU; Floyd–Steinberg, Atkinson and Sierra Lite on the CPU.
- Tone controls (brightness, contrast, saturation), rotate and mirror.
- Webcam input, paste from clipboard, drag & drop anywhere, three built-in samples.
- Zoom around the cursor, pan, before/after split, pixel grid.
- PNG export at 1–16×, copy to clipboard, start/stop WebM recording (one full loop for videos). Replaces the fixed 3-second recording.
- Eight one-click looks, keyboard shortcuts, settings saved per browser, phone layout.
- Removed the unused FFmpeg dependency (it downloaded ~30 MB of WASM from a CDN on every visit).
- Vitest unit tests.

### Backend
- **Fixed:** uploads used the client's filename as a path (path traversal). Files now go to a private temp dir under a server-chosen name and are cleaned up after the response.
- **Fixed:** k-means ran on every frame, so the palette itself changed frame to frame and caused flicker. Video now uses one palette per clip.
- **Fixed:** blending frames produced colours outside the palette. Output now only ever contains palette colours.
- New stabiliser: motion-compensated colour smoothing plus index hysteresis, with an occlusion check. Frame-to-frame flicker drops ~17× on noisy footage.
- New endpoints: `/health`, `/palettes`, `/palette`, `/process/image`. `/process/video` gains `palette`, `dither`, `stability`, `scale` and `max_frames`.
- H.264 output when available, upload size limit, CORS with Private Network Access, CPU work moved off the event loop.
- pytest suite (unit, video and API tests) and GitHub Actions CI.

## 1.0.0

Initial release: WebGL Bayer preview with per-channel posterisation, 3-second WebM capture, FastAPI optical-flow prototype.
