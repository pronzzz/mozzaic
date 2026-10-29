#version 300 es
// Single oversized triangle that covers the whole viewport.
in vec2 aPos;

void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
