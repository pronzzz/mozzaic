# Mozzaic: Technical Architecture & Guide

## 1. Core Philosophy: "Inverse Super-Resolution"
Mozzaic treats pixel art synthesis not just as downscaling, but as an aesthetic reconstruction process.
- **Spatial Discretization**: Reducing resolution while preserving salient features.
- **Color Quantization**: Reducing the color palette to a representative subset ($k$-means clustering in CIELAB space).
- **Temporal Consistency**: Ensuring that moving objects in video don't "shimmer" or "boil" due to frame-by-frame quantization noise.

## 2. Frontend Architecture (Client)
The client is a **React 18** application powered by **Vite** and **WebGL**.

### WebGL Pipeline (`Pixelator.tsx`)
The rendering loop occurs entirely on the GPU for real-time performance (60fps+).
1.  **Vertex Shader**: Handles the 2D quad positioning and texture rotation.
    -   *Rotation Logic*: Rotates UV coordinates around the center $(0.5, 0.5)$ based on the user's rotation selection.
2.  **Fragment Shader**: Use Ordered Dithering.
    -   **Downsampling**: `floor(uv * grid) / grid` creates sharp pixel blocks.
    -   **Bayer Dithering**: A $4 \times 4$ Bayer matrix is applied to the threshold before quantization. This adds "texture" and simulates higher color depth.
    -   **Quantization**: Mathematical rounding of color channels to the nearest discrete step defined by the "Palette" slider.

### Video Export
- **MediaRecorder API**: We capture the WebGL canvas stream (`canvas.captureStream(30)`) and encode it into a `WebM` file on the fly. This allows for instant "WYSIWYG" export without heavy server processing for short clips.

## 3. Backend Architecture (Server)
For high-fidelity, long-duration video processing, we use **Python** and **FastAPI**.

### Optical Flow Stabilization
The "boiling" effect in pixel art video comes from pixels flipping between quantized colors randomly due to sensor noise.
- **Algorithm**: `cv2.calcOpticalFlowFarneback`.
- **Logic**: We calculate the motion vectors between Frame $t$ and Frame $t-1$. We then warp the *quantized* result of Frame $t-1$ forward to align with Frame $t$. We blend this warped history with the raw quantization of Frame $t$.
- **Result**: Colors "stick" to objects as they move, rather than flickering in place.

### Color Palettes
We use **K-Means Clustering** in **CIELAB** color space (perceptually uniform) to find the best $k$ colors that represent the entire video or image, ensuring the palette feels cohesive and "hand-picked".
