import quadVert from '../shaders/quad.vert?raw';
import prepFrag from '../shaders/prep.frag?raw';
import quantizeFrag from '../shaders/quantize.frag?raw';
import displayFrag from '../shaders/display.frag?raw';
import { PaletteMatcher, levelsPalette, rgbToOklab, type RGB } from './color';
import { diffuse, isDiffusion } from './dither';
import { MAX_PALETTE } from './paletteIO';
import type { Settings } from './settings';

export type SourceElement = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

export interface ViewState {
  /** Multiplier on top of "fit to screen". */
  zoom: number;
  /** Pan in CSS px. */
  panX: number;
  panY: number;
  compare: boolean;
  /** Compare split position, 0..1 across the canvas. */
  split: number;
  grid: boolean;
}

export interface ViewTransform {
  scale: number; // CSS px per art px
  offsetX: number; // CSS px
  offsetY: number;
  fitScale: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
  program: WebGLProgram;
  u: Uniforms;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, frag: string, names: string[]): Program {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, quadVert));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  const u: Uniforms = {};
  for (const n of names) u[n] = gl.getUniformLocation(program, n);
  return { program, u };
}

function makeTarget(gl: WebGL2RenderingContext) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
}

export function sourceSize(el: SourceElement): [number, number] {
  if (el instanceof HTMLVideoElement) return [el.videoWidth, el.videoHeight];
  if (el instanceof HTMLImageElement) return [el.naturalWidth, el.naturalHeight];
  return [el.width, el.height];
}

/** Output size in art pixels for a source + settings. */
export function artSizeFor(srcW: number, srcH: number, s: Pick<Settings, 'resolution' | 'rotation'>): [number, number] {
  const sideways = s.rotation % 2 === 1;
  const dw = sideways ? srcH : srcW;
  const dh = sideways ? srcW : srcH;
  const w = Math.max(4, Math.min(Math.round(s.resolution), dw, 1024));
  const h = Math.max(1, Math.min(1024, Math.round((w * dh) / dw)));
  return [w, h];
}

/** Effective palette for the current settings (adaptive palette passed in). */
export function resolvePalette(s: Settings, presetColors: RGB[], adaptive: RGB[] | null): RGB[] {
  switch (s.paletteMode) {
    case 'preset':
      return presetColors;
    case 'adaptive':
      return adaptive && adaptive.length ? adaptive : presetColors;
    case 'custom':
      return s.customPalette.length ? s.customPalette.slice(0, MAX_PALETTE) : presetColors;
    case 'levels':
      return levelsPalette(s.levels);
  }
}

/**
 * Three-pass WebGL2 pipeline:
 *  1. prep      source → art-size texture (area filter, rotate, tone)
 *  2. quantize  palette / levels with ordered dither  (or CPU error diffusion)
 *  3. display   nearest upscale to the canvas with zoom, compare and grid
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prep: Program;
  private quant: Program;
  private display: Program;
  private vao: WebGLVertexArrayObject;
  private srcTex: WebGLTexture;
  private prepT: { tex: WebGLTexture; fbo: WebGLFramebuffer };
  private quantT: { tex: WebGLTexture; fbo: WebGLFramebuffer };

  private source: SourceElement | null = null;
  private live = false;
  private srcW = 1;
  private srcH = 1;
  private artW = 1;
  private artH = 1;

  private settings: Settings | null = null;
  private palette: RGB[] = [[0, 0, 0]];
  private matcher: PaletteMatcher | null = null;
  private cpuOut: Uint8ClampedArray | null = null;

  private view: ViewState = { zoom: 1, panX: 0, panY: 0, compare: false, split: 0.5, grid: false };
  private dirty = true;
  private continuous = false;
  private raf = 0;
  private dpr = 1;
  private frameListeners = new Set<() => void>();
  /** Last frame time in ms, for the stats chip. */
  lastFrameMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.prep = link(gl, prepFrag, ['uSource', 'uSourceSize', 'uArtSize', 'uRotation', 'uFlipX', 'uBrightness', 'uContrast', 'uSaturation']);
    this.quant = link(gl, quantizeFrag, ['uInput', 'uMode', 'uPalette', 'uPaletteLab', 'uPaletteSize', 'uLevels', 'uDither', 'uBayerBits', 'uSpread']);
    this.display = link(gl, displayFrag, ['uArt', 'uSource', 'uArtSize', 'uCanvasSize', 'uScale', 'uOffset', 'uSplit', 'uGrid', 'uRotation', 'uFlipX', 'uDpr']);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.srcTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    this.prepT = makeTarget(gl);
    this.quantT = makeTarget(gl);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.dirty || this.live || this.continuous) this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.frameListeners.clear();
    // The context is kept: React StrictMode remounts reuse the same canvas.
  }

  // ---- inputs -------------------------------------------------------------

  setSource(el: SourceElement | null, live: boolean) {
    this.source = el;
    this.live = live;
    if (el) {
      [this.srcW, this.srcH] = sourceSize(el);
      this.upload();
    }
    this.updateArtSize();
    this.dirty = true;
  }

  setSettings(s: Settings) {
    this.settings = s;
    this.updateArtSize();
    this.dirty = true;
  }

  setPalette(p: RGB[]) {
    // Levels mode can exceed the GPU limit; the GPU path slices, the CPU path uses all of it.
    this.palette = p.length ? p : [[0, 0, 0]];
    this.matcher = null;
    this.dirty = true;
  }

  setView(v: Partial<ViewState>) {
    this.view = { ...this.view, ...v };
    this.dirty = true;
  }

  getView(): ViewState {
    return this.view;
  }

  /** Keep drawing every frame (used while recording). */
  setContinuous(on: boolean) {
    this.continuous = on;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  onFrame(fn: () => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  get artSize(): [number, number] {
    return [this.artW, this.artH];
  }

  get hasSource(): boolean {
    return this.source !== null;
  }

  // ---- view maths ---------------------------------------------------------

  viewTransform(): ViewTransform {
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    const fitScale = Math.max(0.01, Math.min((cw * 0.9) / this.artW, (ch * 0.88) / this.artH));
    // Snap to whole device pixels per art pixel when we can, so blocks stay even.
    const raw = fitScale * this.view.zoom;
    const devicePx = raw * this.dpr;
    const scale = devicePx >= 2 ? Math.floor(devicePx) / this.dpr : raw;
    const offsetX = Math.round((cw - this.artW * scale) / 2 + this.view.panX);
    const offsetY = Math.round((ch - this.artH * scale) / 2 + this.view.panY);
    return { scale, offsetX, offsetY, fitScale };
  }

  // ---- pixels out -----------------------------------------------------------

  /** Quantised art pixels, RGBA, top row first. */
  readArt(): { data: Uint8ClampedArray; width: number; height: number } {
    if (this.dirty) this.draw();
    if (this.cpuOut && this.usesCpu()) {
      return { data: this.cpuOut.slice(), width: this.artW, height: this.artH };
    }
    return { data: this.readTarget(this.quantT.fbo), width: this.artW, height: this.artH };
  }

  /** Pre-quantisation pixels (after resize + tone), used for adaptive palettes. */
  readPrepared(): Uint8ClampedArray {
    if (this.dirty) this.draw();
    return this.readTarget(this.prepT.fbo);
  }

  private readTarget(fbo: WebGLFramebuffer): Uint8ClampedArray {
    const gl = this.gl;
    const out = new Uint8ClampedArray(this.artW * this.artH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.readPixels(0, 0, this.artW, this.artH, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  // ---- internals ------------------------------------------------------------

  private usesCpu(): boolean {
    return !!this.settings && isDiffusion(this.settings.dither) && this.settings.ditherStrength > 0;
  }

  private updateArtSize() {
    if (!this.settings) return;
    const [w, h] = artSizeFor(this.srcW, this.srcH, this.settings);
    if (w === this.artW && h === this.artH) return;
    this.artW = w;
    this.artH = h;
    const gl = this.gl;
    for (const t of [this.prepT, this.quantT]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  private upload() {
    const gl = this.gl;
    const el = this.source;
    if (!el) return;
    if (el instanceof HTMLVideoElement && el.readyState < 2) return;
    const [w, h] = sourceSize(el);
    if (w === 0 || h === 0) return;
    if (w !== this.srcW || h !== this.srcH) {
      this.srcW = w;
      this.srcH = h;
      this.updateArtSize();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  private draw() {
    const t0 = performance.now();
    this.dirty = false;
    const s = this.settings;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    if (this.source && s) {
      if (this.live) this.upload();
      this.runPrep(s);
      if (this.usesCpu()) this.runCpuQuantize(s);
      else this.runGpuQuantize(s);
    }
    this.runDisplay(s);
    this.lastFrameMs = performance.now() - t0;
    for (const fn of this.frameListeners) fn();
  }

  private runPrep(s: Settings) {
    const gl = this.gl;
    const { program, u } = this.prep;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prepT.fbo);
    gl.viewport(0, 0, this.artW, this.artH);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.uniform1i(u.uSource, 0);
    gl.uniform2f(u.uSourceSize, this.srcW, this.srcH);
    gl.uniform2f(u.uArtSize, this.artW, this.artH);
    gl.uniform1i(u.uRotation, s.rotation);
    gl.uniform1i(u.uFlipX, s.flipX ? 1 : 0);
    gl.uniform1f(u.uBrightness, s.brightness);
    gl.uniform1f(u.uContrast, s.contrast);
    gl.uniform1f(u.uSaturation, s.saturation);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private runGpuQuantize(s: Settings) {
    const gl = this.gl;
    const { program, u } = this.quant;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.quantT.fbo);
    gl.viewport(0, 0, this.artW, this.artH);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.prepT.tex);
    gl.uniform1i(u.uInput, 0);

    const levelsMode = s.paletteMode === 'levels';
    gl.uniform1i(u.uMode, levelsMode ? 1 : 0);
    gl.uniform1f(u.uLevels, Math.max(2, s.levels));

    const pal = this.palette.slice(0, MAX_PALETTE);
    const n = pal.length;
    const rgb = new Float32Array(MAX_PALETTE * 3);
    const lab = new Float32Array(MAX_PALETTE * 3);
    pal.forEach((c, i) => {
      rgb.set([c[0] / 255, c[1] / 255, c[2] / 255], i * 3);
      lab.set(rgbToOklab(c), i * 3);
    });
    gl.uniform3fv(u.uPalette, rgb);
    gl.uniform3fv(u.uPaletteLab, lab);
    gl.uniform1i(u.uPaletteSize, n);

    const mode = s.dither;
    const dither = mode.startsWith('bayer') ? 1 : mode === 'noise' ? 2 : 0;
    gl.uniform1i(u.uDither, dither);
    gl.uniform1i(u.uBayerBits, mode === 'bayer2' ? 1 : mode === 'bayer8' ? 3 : 2);
    // How far a dither offset may push a colour, relative to palette spacing.
    const base = levelsMode ? 1 / (Math.max(2, s.levels) - 1) : Math.min(1, 1.2 / Math.cbrt(n));
    gl.uniform1f(u.uSpread, dither ? s.ditherStrength * base : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private runCpuQuantize(s: Settings) {
    const gl = this.gl;
    const prepared = this.readTarget(this.prepT.fbo);
    if (!this.matcher) this.matcher = new PaletteMatcher(this.palette);
    this.cpuOut = diffuse(prepared, this.artW, this.artH, this.matcher, s.dither as 'floyd', s.ditherStrength);
    gl.bindTexture(gl.TEXTURE_2D, this.quantT.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.artW, this.artH, gl.RGBA, gl.UNSIGNED_BYTE, this.cpuOut);
  }

  private runDisplay(s: Settings | null) {
    const gl = this.gl;
    const { program, u } = this.display;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.source || !s) {
      gl.clearColor(0.043, 0.043, 0.055, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const vt = this.viewTransform();
    const d = this.dpr;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.quantT.tex);
    gl.uniform1i(u.uArt, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.uniform1i(u.uSource, 1);
    gl.uniform2f(u.uArtSize, this.artW, this.artH);
    gl.uniform2f(u.uCanvasSize, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uScale, vt.scale * d);
    gl.uniform2f(u.uOffset, vt.offsetX * d, vt.offsetY * d);
    gl.uniform1f(u.uSplit, this.view.compare ? this.view.split * this.canvas.width : -1);
    gl.uniform1f(u.uGrid, this.view.grid && vt.scale * d >= 6 ? 0.28 : 0);
    gl.uniform1i(u.uRotation, s.rotation);
    gl.uniform1i(u.uFlipX, s.flipX ? 1 : 0);
    gl.uniform1f(u.uDpr, d);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }
}
