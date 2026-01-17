import numpy as np
import cv2
from processing import downsample_image, quantize_image_kmeans

def test_downsample_image():
    # Create a dummy 100x100 RGB image
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    
    target_width = 10
    result = downsample_image(img, target_width)
    
    assert result.shape[1] == target_width
    assert result.shape[0] == 10 # Square aspect
    
def test_quantize_image():
    # Random noise image with predictable shape
    img = np.random.randint(0, 255, (20, 20, 3), dtype=np.uint8)
    
    k = 4
    result = quantize_image_kmeans(img, k=k)
    
    assert result.shape == img.shape
    
    # Flatten and find unique colors
    pixels = result.reshape(-1, 3)
    unique_colors = np.unique(pixels, axis=0)
    
    # K-Means should return <= K colors
    assert len(unique_colors) <= k
    
    # Check data type
    assert result.dtype == np.uint8
