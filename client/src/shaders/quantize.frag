#version 300 es
// Pass 2: art-resolution colour reduction with ordered dithering.
// Palette matching happens in Oklab, so "nearest" means perceptually nearest.
precision highp float;
precision highp int;

uniform sampler2D uInput;
uniform int uMode;          // 0 = palette, 1 = levels per channel
uniform vec3 uPalette[64];  // sRGB 0..1
uniform vec3 uPaletteLab[64];
uniform int uPaletteSize;
uniform float uLevels;
uniform int uDither;        // 0 none, 1 bayer, 2 noise
uniform int uBayerBits;     // 1 -> 2x2, 2 -> 4x4, 3 -> 8x8
uniform float uSpread;      // dither amplitude in sRGB units

out vec4 fragColor;

// Recursive Bayer matrix value in [0, 1).
float bayer(ivec2 p, int bits) {
  int v = 0;
  for (int k = 0; k < 3; k++) {
    if (k >= bits) break;
    int x = (p.x >> k) & 1;
    int y = (p.y >> k) & 1;
    v = v * 4 + (2 * (x ^ y) + y);
  }
  float n = float(1 << (2 * bits));
  return (float(v) + 0.5) / n;
}

// Interleaved gradient noise (Jimenez 2014): cheap, evenly spread.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 oklab(vec3 c) {
  c = toLinear(clamp(c, 0.0, 1.0));
  vec3 lms = vec3(
    0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
    0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
    0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(uInput, p, 0);

  float t = 0.0;
  if (uDither == 1) t = bayer(p, uBayerBits) - 0.5;
  else if (uDither == 2) t = ign(vec2(p)) - 0.5;
  vec3 c = src.rgb + t * uSpread;

  vec3 outRgb;
  if (uMode == 1) {
    float n = uLevels - 1.0;
    outRgb = floor(clamp(c, 0.0, 1.0) * n + 0.5) / n;
  } else {
    vec3 lab = oklab(c);
    float best = 1e9;
    outRgb = uPalette[0];
    for (int i = 0; i < 64; i++) {
      if (i >= uPaletteSize) break;
      vec3 d = lab - uPaletteLab[i];
      float dist = dot(d, d);
      if (dist < best) {
        best = dist;
        outRgb = uPalette[i];
      }
    }
  }

  fragColor = vec4(outRgb, src.a < 0.5 ? 0.0 : 1.0);
}
