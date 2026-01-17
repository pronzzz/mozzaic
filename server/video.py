import cv2
import numpy as np
from typing import Optional
from .processing import downsample_image, quantize_image_kmeans

def process_video_stabilized(input_path: str, output_path: str, target_width: int = 320, k: int = 8, flow_alpha: float = 0.7):
    """
    Process video with Optical Flow stabilization.
    flow_alpha: Strength of the temporal blending (0.0 = Raw Frame, 1.0 = Fully Warped Previous).
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print("Error opening video stream or file")
        return

    # Video properties
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS)

    # Output writer setup
    # Calculate target dimensions logic from processing.py
    aspect = height / width
    out_w = target_width
    out_h = int(target_width * aspect)
    
    # MP4V codec
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (out_w, out_h))

    prev_gray = None
    prev_output = None # O_{t-1}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # 1. Downsample first? 
        # Optical flow is expensive on HD. Better to calculate flow on the LOW RES,
        # or calculate on HD and scale down flow?
        # The framework suggests: "Warp the *processed* (pixelated) output of Frame t-1 forward"
        # So we work in the low-res domain for the output, but tracking might be better in higher res?
        # Let's downsample INPUT first for efficiency.
        
        frame_small = downsample_image(frame, out_w)
        frame_gray = cv2.cvtColor(frame_small, cv2.COLOR_BGR2GRAY)

        # 2. Quantize the current frame (The "Candidate")
        # I_quantized
        candidate = quantize_image_kmeans(frame_small, k)

        if prev_gray is not None and prev_output is not None:
            # 3. Calculate Optical Flow (Farneback)
            # flow has shape (h, w, 2)
            flow = cv2.calcOpticalFlowFarneback(prev_gray, frame_gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            
            # 4. Warp O_{t-1}
            # We need to map pixels from T-1 to T.
            # Grid of coordinates (x, y)
            # New Pos = Old Pos + Flow
            # Therefore Value at New Pos comes from Old Pos.
            # cv2.remap does backwards mapping: dest(x,y) = src(map_x(x,y), map_y(x,y))
            # flow(x,y) gives displacement delta.
            # If we want O_t(x,y), we should look at O_{t-1}(x - u, y - v).
            # So flow needs to be inverted or we use backward flow? 
            # Farneback gives flow from prev to cur.
            # So pixel at (x,y) in Cur came from (x-u, y-v) in Prev.
            
            h, w = flow.shape[:2]
            map_x, map_y = np.meshgrid(np.arange(w), np.arange(h))
            
            # map_x is float32
            map_x = map_x.astype(np.float32)
            map_y = map_y.astype(np.float32)
            
            # Subtract flow to find source
            map_x -= flow[..., 0]
            map_y -= flow[..., 1]
            
            warped_prev = cv2.remap(prev_output, map_x, map_y, interpolation=cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
            
            # 5. Blend
            # O_t = M * Candidate + (1-M) * WarpedPrev
            # Simple alpha blend for now, can be sophisticated with occlusion mask (M)
            # If flow is large (fast motion), trust candidate more (M approaches 1).
            # If flow is small, trust history (M approaches 0).
            # For this MVP, we use fixed alpha or simple magnitude check.
            
            # Use float for blending
            blend = cv2.addWeighted(candidate, 1.0 - flow_alpha, warped_prev, flow_alpha, 0)
            
            # Re-quantize to ensure colors valid? 
            # Blending introduces intermediate colors.
            # Framework mentions: "This forces the palette choices to 'stick'..."
            # Ideally we pick the palette index.
            # But simple blending + re-quantizing (or just k=colors) works.
            # Let's keep it simple: Blend then optional re-quantize or just output.
            
            final_output = blend
        else:
            final_output = candidate

        out.write(final_output)

        prev_gray = frame_gray
        prev_output = final_output

    cap.release()
    out.release()
