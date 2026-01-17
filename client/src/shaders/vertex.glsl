attribute vec2 position;
varying vec2 vUv;
uniform float uRotation; // Angle in radians

void main() {
  vec2 uv = position * 0.5 + 0.5;
  
  // Rotate around center (0.5, 0.5)
  // Translate to center -> Rotate -> Translate back
  float s = sin(uRotation);
  float c = cos(uRotation);
  mat2 rot = mat2(c, -s, s, c);
  
  vec2 centered = uv - 0.5;
  centered = rot * centered;
  vUv = centered + 0.5;

  // Correct for aspect ratio in vertex shader? 
  // No, logic is simpler if we rotate UVs and rely on container aspect ratio.
  // Although rotating 90 degrees on a rectangular quad might squash texture if we don't swap dimensions?
  // We handle the "swap" in React by changing container aspect ratio. Texture mapping will follow.
  
  gl_Position = vec4(position, 0.0, 1.0);
}
