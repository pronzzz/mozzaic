#version 300 es
// Pass 3: art texture -> screen. Nearest-neighbour upscale with zoom/pan,
// optional before/after split, pixel grid and a checkerboard under alpha.
precision highp float;

uniform sampler2D uArt;
uniform sampler2D uSource;
uniform vec2 uArtSize;
uniform vec2 uCanvasSize;
uniform float uScale;      // screen px per art px
uniform vec2 uOffset;      // screen px of the art's top-left corner
uniform float uSplit;      // compare split in screen px, < 0 = off
uniform float uGrid;       // grid opacity
uniform int uRotation;
uniform bool uFlipX;
uniform float uDpr;

out vec4 fragColor;

const vec3 BG = vec3(0.043, 0.043, 0.055);

vec2 toSource(vec2 d) {
  if (uFlipX) d.x = 1.0 - d.x;
  if (uRotation == 1) return vec2(d.y, 1.0 - d.x);
  if (uRotation == 2) return vec2(1.0 - d.x, 1.0 - d.y);
  if (uRotation == 3) return vec2(1.0 - d.y, d.x);
  return d;
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y);
  vec2 ap = (screen - uOffset) / uScale;

  if (any(lessThan(ap, vec2(0.0))) || any(greaterThanEqual(ap, uArtSize))) {
    fragColor = vec4(BG, 1.0);
    return;
  }

  vec4 c;
  bool original = uSplit >= 0.0 && screen.x < uSplit;
  if (original) {
    c = texture(uSource, toSource(ap / uArtSize));
  } else {
    c = texelFetch(uArt, ivec2(floor(ap)), 0);
  }

  // Checkerboard behind transparent pixels.
  vec2 checker = floor(screen / (8.0 * uDpr));
  float chk = mod(checker.x + checker.y, 2.0);
  vec3 under = mix(vec3(0.16), vec3(0.22), chk);
  vec3 rgb = mix(under, c.rgb, c.a);

  if (!original && uGrid > 0.0) {
    vec2 f = fract(ap) * uScale;
    if (f.x < uDpr || f.y < uDpr) rgb = mix(rgb, vec3(0.0), uGrid);
  }

  if (uSplit >= 0.0 && abs(screen.x - uSplit) < uDpr) rgb = vec3(1.0);

  fragColor = vec4(rgb, 1.0);
}
