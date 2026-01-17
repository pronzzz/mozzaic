precision mediump float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uColorCount;
uniform float uDitherStrength;

// Hardcoded Bayer Pattern to avoid array constructor in GLSL 1.00
float getBayer(vec2 uv) {
    int x = int(mod(uv.x, 4.0));
    int y = int(mod(uv.y, 4.0));
    int index = y * 4 + x;
    
    if (index == 0) return 0.0/16.0;
    if (index == 1) return 8.0/16.0;
    if (index == 2) return 2.0/16.0;
    if (index == 3) return 10.0/16.0;
    if (index == 4) return 12.0/16.0;
    if (index == 5) return 4.0/16.0;
    if (index == 6) return 14.0/16.0;
    if (index == 7) return 6.0/16.0;
    if (index == 8) return 3.0/16.0;
    if (index == 9) return 11.0/16.0;
    if (index == 10) return 1.0/16.0;
    if (index == 11) return 9.0/16.0;
    if (index == 12) return 15.0/16.0;
    if (index == 13) return 7.0/16.0;
    if (index == 14) return 13.0/16.0;
    if (index == 15) return 5.0/16.0;
    return 0.0;
}

void main() {
  vec2 gridUV = floor(vUv * (uResolution / uPixelSize)) / (uResolution / uPixelSize);
  gridUV += (uPixelSize / uResolution) * 0.5;
  
  vec4 color = texture2D(uTexture, gridUV);

  vec2 pixelCoord = gl_FragCoord.xy / uPixelSize;
  float threshold = getBayer(pixelCoord);
  
  vec3 dither = vec3((threshold - 0.5) * uDitherStrength);
  vec3 ditheredColor = color.rgb + dither;

  float steps = uColorCount;
  vec3 quantized = floor(ditheredColor * (steps - 1.0) + 0.5) / (steps - 1.0);

  gl_FragColor = vec4(quantized, color.a);
}
