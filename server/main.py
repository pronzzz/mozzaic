"""Mozzaic API.

Run from the repository root:

    uvicorn server.main:app --reload
"""

from __future__ import annotations

import inspect
import os
import shutil
import tempfile
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from . import __version__
from .palettes import PRESETS
from .processing import bgr_to_hex, downsample_image, kmeans_palette, parse_palette, pixelate
from .video import process_video_stabilized

MAX_UPLOAD_MB = int(os.environ.get("MOZZAIC_MAX_UPLOAD_MB", "200"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("MOZZAIC_CORS_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(
    title="Mozzaic API",
    version=__version__,
    description="Stabilised pixel-art rendering for images and video.",
)

# Private Network Access lets the hosted web app (https) call a server on
# localhost in Chrome. Newer Starlette supports it natively.
_cors_pna = "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Mozzaic-Palette", "X-Mozzaic-Frames", "Content-Disposition"],
    **({"allow_private_network": True} if _cors_pna else {}),
)

if not _cors_pna:

    @app.middleware("http")
    async def private_network_access(request: Request, call_next):
        response = await call_next(request)
        if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

async def _save_upload(upload: UploadFile, folder: str, prefix: str) -> str:
    """Stream an upload to a server-chosen path (never the client's filename)."""
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if not ext.isascii() or not ext[1:].isalnum() or len(ext) > 6:
        ext = ""
    path = os.path.join(folder, f"{prefix}{ext}")
    limit = MAX_UPLOAD_MB * 1024 * 1024
    written = 0
    with open(path, "wb") as out:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > limit:
                raise HTTPException(413, f"Upload is larger than {MAX_UPLOAD_MB} MB")
            out.write(chunk)
    if written == 0:
        raise HTTPException(400, "Empty upload")
    return path


def _palette_or_422(spec: Optional[str]) -> Optional[np.ndarray]:
    try:
        return parse_palette(spec)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


def _decode_image(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(400, "Could not decode the image")
    if img.dtype != np.uint8:
        img = cv2.convertScaleAbs(img, alpha=255.0 / max(1, int(img.max())))
    return img


def _palette_header(palette: np.ndarray) -> str:
    return ",".join(bgr_to_hex(c)[1:] for c in palette)


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def root():
    return {"name": "Mozzaic API", "version": __version__, "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok", "version": __version__}


@app.get("/palettes")
def palettes():
    """Built-in palettes as hex lists."""
    return {name: [f"#{h}" for h in colors] for name, colors in PRESETS.items()}


@app.post("/palette")
async def extract_palette(
    file: UploadFile = File(..., description="Image to sample"),
    colors: int = Query(8, ge=2, le=64),
):
    """Suggest a palette for an image with k-means in CIELAB."""
    img = _decode_image(await file.read())
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    bgr = downsample_image(img[..., :3], 256)
    pal = await run_in_threadpool(kmeans_palette, bgr, colors)
    return {"colors": [bgr_to_hex(c) for c in pal]}


@app.post("/process/image", response_class=Response, responses={200: {"content": {"image/png": {}}}})
async def process_image(
    file: UploadFile = File(...),
    width: int = Query(160, ge=8, le=1024, description="Output width in art pixels"),
    palette: Optional[str] = Query(None, description="Preset id or comma-separated hex list. Empty = k-means"),
    colors: int = Query(16, ge=2, le=64, description="Palette size when no palette is given"),
    dither: str = Query("floyd", pattern="^(none|bayer4|floyd)$"),
    strength: float = Query(1.0, ge=0, le=1),
    scale: int = Query(1, ge=1, le=16),
):
    """Pixelate a still image and return a PNG."""
    pal = _palette_or_422(palette)
    img = _decode_image(await file.read())
    out, used = await run_in_threadpool(pixelate, img, width, pal, colors, dither, strength, scale)
    ok, png = cv2.imencode(".png", out)
    if not ok:
        raise HTTPException(500, "PNG encoding failed")
    return Response(png.tobytes(), media_type="image/png", headers={"X-Mozzaic-Palette": _palette_header(used)})


@app.post("/process/video", response_class=FileResponse, responses={200: {"content": {"video/mp4": {}, "video/webm": {}}}})
async def process_video(
    file: UploadFile = File(...),
    width: int = Query(160, ge=16, le=640, description="Output width in art pixels"),
    palette: Optional[str] = Query(None, description="Preset id or comma-separated hex list. Empty = k-means over sampled frames"),
    colors: int = Query(16, ge=2, le=64),
    dither: str = Query("none", pattern="^(none|bayer4)$"),
    stability: float = Query(0.6, ge=0, le=1, description="0 = raw per-frame quantisation, 1 = maximum stickiness"),
    scale: int = Query(4, ge=1, le=8, description="Nearest-neighbour upscale of the output"),
    max_frames: int = Query(3600, ge=1, le=18000),
):
    """Render a temporally stable pixel-art video."""
    pal = _palette_or_422(palette)
    workdir = tempfile.mkdtemp(prefix="mozzaic-")
    cleanup = BackgroundTask(shutil.rmtree, workdir, ignore_errors=True)
    try:
        src = await _save_upload(file, workdir, "input")
        result = await run_in_threadpool(
            process_video_stabilized,
            src,
            os.path.join(workdir, "output"),
            width,
            pal,
            colors,
            stability,
            dither,
            scale,
            max_frames,
        )
    except HTTPException:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    except ValueError as e:
        shutil.rmtree(workdir, ignore_errors=True)
        raise HTTPException(400, str(e)) from e
    except Exception:
        shutil.rmtree(workdir, ignore_errors=True)
        raise

    stem = os.path.splitext(os.path.basename(file.filename or "video"))[0] or "video"
    safe_stem = "".join(c for c in stem if c.isalnum() or c in "-_")[:60] or "video"
    ext = os.path.splitext(result.path)[1]
    return FileResponse(
        result.path,
        media_type=result.media_type,
        filename=f"{safe_stem}-mozzaic{ext}",
        background=cleanup,
        headers={"X-Mozzaic-Palette": _palette_header(result.palette), "X-Mozzaic-Frames": str(result.frames)},
    )


@app.exception_handler(RuntimeError)
async def runtime_error(_: Request, exc: RuntimeError):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
