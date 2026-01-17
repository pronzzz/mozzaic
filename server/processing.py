import cv2
import numpy as np
from sklearn.cluster import MiniBatchKMeans

def downsample_image(image: np.ndarray, target_width: int) -> np.ndarray:
    """
    Downsamples the image to specific width using Area Interpolation.
    Maintains aspect ratio.
    """
    h, w = image.shape[:2]
    aspect = h / w
    target_height = int(target_width * aspect)
    
    # INTER_AREA is the best for decimation (downsampling) to avoid moire/aliasing
    small = cv2.resize(image, (target_width, target_height), interpolation=cv2.INTER_AREA)
    return small

def quantize_image_kmeans(image: np.ndarray, k: int = 8) -> np.ndarray:
    """
    Quantizes image colors to k clusters using K-Means in LAB color space.
    """
    # Convert to LAB for perceptual distance
    lab_image = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    h, w, c = lab_image.shape
    
    # Reshape to (N, 3)
    pixels = lab_image.reshape((-1, 3))
    
    # K-Means
    clt = MiniBatchKMeans(n_clusters=k, batch_size=4096, n_init=3)
    clt.fit(pixels)
    labels = clt.labels_
    centers = clt.cluster_centers_.astype("uint8")
    
    # Map back
    quantized_lab = centers[labels].reshape((h, w, c))
    
    # Convert back to BGR
    quantized_bgr = cv2.cvtColor(quantized_lab, cv2.COLOR_LAB2BGR)
    return quantized_bgr

def apply_palette(image: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """
    Maps an image to a fixed palette using nearest neighbor.
    Palette should be (N, 3) in BGR.
    """
    # TODO: Implement efficient KDTree lookup if needed.
    # For now, simplistic approach is fine or relying on K-Means centers if we generated palette.
    pass
