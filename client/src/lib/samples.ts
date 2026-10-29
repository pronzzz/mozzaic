/**
 * Procedural sample images, drawn on a canvas so the repo ships no
 * third-party photos. They are also handy test cards for palettes.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ridge(rand: () => number, w: number, base: number, rough: number, steps = 7): number[] {
  // Midpoint displacement → a jagged mountain line.
  let pts = [base + (rand() - 0.5) * rough, base + (rand() - 0.5) * rough];
  let amp = rough;
  for (let i = 0; i < steps; i++) {
    const next: number[] = [];
    for (let j = 0; j < pts.length - 1; j++) {
      next.push(pts[j], (pts[j] + pts[j + 1]) / 2 + (rand() - 0.5) * amp);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    amp *= 0.55;
  }
  void w;
  return pts;
}

function fillRidge(ctx: CanvasRenderingContext2D, pts: number[], w: number, bottom: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  pts.forEach((y, i) => ctx.lineTo((i / (pts.length - 1)) * w, y));
  ctx.lineTo(w, bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawSunset(w = 1600, h = 1000): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rand = rng(7);
  const horizon = h * 0.64;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0d0a2a');
  sky.addColorStop(0.35, '#3a1b5c');
  sky.addColorStop(0.62, '#a8326e');
  sky.addColorStop(0.85, '#f2704c');
  sky.addColorStop(1, '#ffc56e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // Stars
  for (let i = 0; i < 160; i++) {
    const x = rand() * w;
    const y = rand() * horizon * 0.45;
    const r = rand() * 1.8 + 0.4;
    ctx.globalAlpha = 0.35 + rand() * 0.65;
    ctx.fillStyle = '#fff6e0';
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;

  // Sun with synthwave cut-outs
  const sx = w * 0.56;
  const sy = horizon - h * 0.05;
  const sr = h * 0.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 2.6);
  glow.addColorStop(0, 'rgba(255,190,120,0.55)');
  glow.addColorStop(1, 'rgba(255,120,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizon);
  const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, '#fff4a8');
  sun.addColorStop(0.5, '#ffb35c');
  sun.addColorStop(1, '#ff4f7b');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const y = sy + sr * 0.05 + i * sr * 0.15;
    ctx.fillRect(sx - sr, y, sr * 2, 3 + i * 2.6);
  }
  ctx.restore();
  // Re-fill the cut-outs with the sky behind the sun.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  ctx.restore();

  // Clouds
  for (let i = 0; i < 9; i++) {
    const cx = rand() * w;
    const cy = horizon * (0.25 + rand() * 0.45);
    const cw = 160 + rand() * 320;
    const ch = 14 + rand() * 22;
    const g = ctx.createLinearGradient(0, cy - ch, 0, cy + ch);
    g.addColorStop(0, 'rgba(255,180,190,0.0)');
    g.addColorStop(0.5, 'rgba(255,150,170,0.45)');
    g.addColorStop(1, 'rgba(120,40,110,0.35)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mountains, far to near
  const layers = [
    { base: horizon - h * 0.12, rough: h * 0.22, top: '#7a3a84', bot: '#4b2266' },
    { base: horizon - h * 0.06, rough: h * 0.16, top: '#4a2160', bot: '#2c1446' },
    { base: horizon - h * 0.015, rough: h * 0.08, top: '#26103a', bot: '#170a26' },
  ];
  for (const l of layers) {
    const g = ctx.createLinearGradient(0, l.base - l.rough, 0, horizon);
    g.addColorStop(0, l.top);
    g.addColorStop(1, l.bot);
    fillRidge(ctx, ridge(rand, w, l.base, l.rough), w, horizon + 1, g);
  }

  // Water
  const water = ctx.createLinearGradient(0, horizon, 0, h);
  water.addColorStop(0, '#3a1d5c');
  water.addColorStop(0.4, '#1d1240');
  water.addColorStop(1, '#0a0820');
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Sun reflection streaks
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const y = horizon + 6 + t * (h - horizon) * 0.8;
    const half = sr * (1.05 - t * 0.75) * (0.6 + rand() * 0.5);
    ctx.globalAlpha = 0.85 - t * 0.6;
    ctx.fillStyle = t < 0.3 ? '#ffc070' : t < 0.6 ? '#ff7a6a' : '#c0407a';
    ctx.fillRect(sx - half + (rand() - 0.5) * 30, y, half * 2, 3 + rand() * 4);
  }
  ctx.globalAlpha = 1;

  // Foreground shore + palm
  const shore = ridge(rand, w, h * 0.93, h * 0.06, 6);
  fillRidge(ctx, shore, w, h, '#07040f');
  drawPalm(ctx, w * 0.14, h * 0.95, h * 0.62);
  drawPalm(ctx, w * 0.9, h * 0.97, h * 0.42);
  return c;
}

function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
  ctx.fillStyle = '#07040f';
  ctx.strokeStyle = '#07040f';
  ctx.lineCap = 'round';
  // Curved trunk
  ctx.lineWidth = height * 0.045;
  const tx = x + height * 0.18;
  const ty = y - height;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + height * 0.02, y - height * 0.6, tx, ty);
  ctx.stroke();
  // Fronds
  const fronds = [-2.9, -2.4, -1.9, -1.2, -0.6, -0.15, 0.35];
  for (const a of fronds) {
    const len = height * (0.42 + 0.08 * Math.cos(a * 2));
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.55 + len * 0.35;
    const cx = tx + Math.cos(a) * len * 0.5;
    const cy = ty - len * 0.22;
    ctx.lineWidth = height * 0.03;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    // Leaflets
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const px = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * cx + t * t * ex;
      const py = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * cy + t * t * ey;
      ctx.lineWidth = height * 0.012;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a + 1.2) * height * 0.05 * (1 - t * 0.5), py + height * 0.07 * (1 - t * 0.4));
      ctx.stroke();
    }
  }
}

export function drawSpectrum(w = 1200, h = 800): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const top = h * 0.82;
  const hue = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 12; i++) hue.addColorStop(i / 12, `hsl(${i * 30}, 100%, 50%)`);
  ctx.fillStyle = hue;
  ctx.fillRect(0, 0, w, top);
  const shade = ctx.createLinearGradient(0, 0, 0, top);
  shade.addColorStop(0, 'rgba(255,255,255,1)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, top);
  const grey = ctx.createLinearGradient(0, 0, w, 0);
  grey.addColorStop(0, '#000');
  grey.addColorStop(1, '#fff');
  ctx.fillStyle = grey;
  ctx.fillRect(0, top, w, h - top);
  return c;
}

/** Animated plasma. Returns the canvas plus a stop() to end the animation. */
export function startPlasma(w = 320, h = 200): { canvas: HTMLCanvasElement; stop: () => void } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let raf = 0;
  const t0 = performance.now();
  const frame = () => {
    const t = (performance.now() - t0) / 1000;
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const a = Math.sin(u * 10 + t * 1.3);
        const b = Math.sin((u * 6 + v * 8) * 1.1 - t * 0.9);
        const cx = u - 0.5 + Math.sin(t * 0.4) * 0.3;
        const cy = v - 0.5 + Math.cos(t * 0.5) * 0.3;
        const r = Math.sin(Math.sqrt(cx * cx + cy * cy) * 18 - t * 2.2);
        const p = (a + b + r) / 3;
        const o = (y * w + x) * 4;
        d[o] = 128 + 127 * Math.sin(Math.PI * p + 0.2);
        d[o + 1] = 128 + 127 * Math.sin(Math.PI * p + 2.3);
        d[o + 2] = 128 + 127 * Math.sin(Math.PI * p + 4.2);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    raf = requestAnimationFrame(frame);
  };
  frame();
  return { canvas: c, stop: () => cancelAnimationFrame(raf) };
}
