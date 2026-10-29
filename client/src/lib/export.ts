import type { Renderer } from './renderer';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'mozzaic';
}

/** Draw art pixels into a canvas scaled by an integer factor, no smoothing. */
function paint(target: HTMLCanvasElement, data: Uint8ClampedArray, w: number, h: number, scale: number, scratch?: HTMLCanvasElement) {
  const small = scratch ?? document.createElement('canvas');
  if (small.width !== w || small.height !== h) {
    small.width = w;
    small.height = h;
  }
  small.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  if (target.width !== w * scale || target.height !== h * scale) {
    target.width = w * scale;
    target.height = h * scale;
  }
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(small, 0, 0, target.width, target.height);
}

export async function renderPng(renderer: Renderer, scale: number): Promise<Blob> {
  const { data, width, height } = renderer.readArt();
  const canvas = document.createElement('canvas');
  paint(canvas, data, width, height, scale);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}

export async function copyPng(renderer: Renderer, scale: number): Promise<void> {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) {
    throw new Error('Copying images is not supported in this browser.');
  }
  const blob = await renderPng(renderer, scale);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

function pickMime(): string {
  const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

export interface Recording {
  stop: () => void;
  done: Promise<{ blob: Blob; ext: string }>;
}

/**
 * Record the quantised output at art-size × scale. The recording canvas is
 * repainted on every renderer frame, so what you see is what you get.
 */
export function startRecording(renderer: Renderer, scale: number, fps = 30): Recording {
  if (typeof MediaRecorder === 'undefined') throw new Error('Recording is not supported in this browser.');
  const canvas = document.createElement('canvas');
  const scratch = document.createElement('canvas');
  const first = renderer.readArt();
  // Keep the recorded frame under ~1080p so encoders cope.
  const s = Math.max(1, Math.min(scale, Math.floor(1920 / first.width), Math.floor(1080 / first.height)));
  paint(canvas, first.data, first.width, first.height, s, scratch);

  const unsub = renderer.onFrame(() => {
    const { data, width, height } = renderer.readArt();
    paint(canvas, data, width, height, s, scratch);
  });
  renderer.setContinuous(true);

  const mime = pickMime();
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<{ blob: Blob; ext: string }>((resolve) => {
    rec.onstop = () => {
      unsub();
      renderer.setContinuous(false);
      const type = rec.mimeType || mime || 'video/webm';
      resolve({ blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' });
    };
  });
  rec.start(250);
  return { stop: () => rec.state !== 'inactive' && rec.stop(), done };
}
