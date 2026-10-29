#version 300 es
// Pass 1: source -> art resolution.
// Area-averages each art pixel (4x4 taps on a mip level), applies
// rotation / flip and the tone adjustments. Row 0 of the output is the TOP row.
precision highp float;

uniform sampler2D uSource;
uniform vec2 uSourceSize;  // source texture size in px
uniform vec2 uArtSize;     // output size in art px (already rotated)
uniform int uRotation;     // quarter turns clockwise
uniform bool uFlipX;
uniform float uBrightness; // -1..1
uniform float uContrast;   // -1..1
uniform float uSaturation; // 0..2

out vec4 fragColor;

// Display-space uv (y down, after rotation + flip) -> source uv.
vec2 toSource(vec2 d) {
  if (uFlipX) d.x = 1.0 - d.x;
  if (uRotation == 1) return vec2(d.y, 1.0 - d.x);
  if (uRotation == 2) return vec2(1.0 - d.x, 1.0 - d.y);
  if (uRotation == 3) return vec2(1.0 - d.y, d.x);
  return d;
}

void main() {
  vec2 cell = gl_FragCoord.xy - 0.5; // integer art pixel (x, row-from-top)
  vec2 srcPerArt = (uRotation == 1 || uRotation == 3)
    ? uSourceSize.yx / uArtSize
    : uSourceSize / uArtSize;
  float lod = max(0.0, log2(max(srcPerArt.x, srcPerArt.y) / 4.0));

  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 d = (cell + (vec2(float(i), float(j)) + 0.5) / 4.0) / uArtSize;
      vec4 s = textureLod(uSource, toSource(d), lod);
      rgb += s.rgb * s.a;
      alpha += s.a;
    }
  }
  vec3 c = alpha > 0.0 ? rgb / alpha : vec3(0.0);
  float a = alpha / 16.0;

  // Tone: contrast around mid grey, then brightness, then saturation.
  float k = uContrast >= 0.0 ? 1.0 + uContrast * 2.0 : 1.0 + uContrast;
  c = (c - 0.5) * k + 0.5 + uBrightness * 0.5;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);

  fragColor = vec4(clamp(c, 0.0, 1.0), a);
}
