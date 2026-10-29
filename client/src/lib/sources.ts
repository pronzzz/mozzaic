import type { SourceElement } from './renderer';
import { sourceSize } from './renderer';
import { drawSpectrum, drawSunset, startPlasma } from './samples';

export type SourceKind = 'image' | 'video' | 'webcam' | 'sample';

export interface Source {
  kind: SourceKind;
  name: string;
  el: SourceElement;
  width: number;
  height: number;
  /** Re-upload every frame (video, webcam, animated sample). */
  live: boolean;
  /** Original file, kept for server-side video rendering. */
  file?: File;
  video?: HTMLVideoElement;
  dispose: () => void;
}

export const SAMPLES = [
  { id: 'sunset', name: 'Sunset', note: 'Still' },
  { id: 'plasma', name: 'Plasma', note: 'Animated' },
  { id: 'spectrum', name: 'Spectrum', note: 'Test card' },
] as const;

export type SampleId = (typeof SAMPLES)[number]['id'];

export function loadSample(id: SampleId): Source {
  if (id === 'plasma') {
    const { canvas, stop } = startPlasma();
    return { kind: 'sample', name: 'Plasma (animated)', el: canvas, width: canvas.width, height: canvas.height, live: true, dispose: stop };
  }
  const canvas = id === 'spectrum' ? drawSpectrum() : drawSunset();
  const name = id === 'spectrum' ? 'Spectrum test card' : 'Sunset';
  return { kind: 'sample', name, el: canvas, width: canvas.width, height: canvas.height, live: false, dispose: () => {} };
}

export const ACCEPTED = 'image/*,video/*';

export function isSupportedFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

export async function loadFile(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('This video format is not supported by your browser.'));
    });
    await video.play().catch(() => {});
    const [width, height] = sourceSize(video);
    return {
      kind: 'video', name: file.name, el: video, width, height, live: true, file, video,
      dispose: () => { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); },
    };
  }

  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Could not decode that image.');
  }
  const [width, height] = sourceSize(img);
  return { kind: 'image', name: file.name, el: img, width, height, live: false, file, dispose: () => URL.revokeObjectURL(url) };
}

export async function openWebcam(): Promise<Source> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available here.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  await new Promise<void>((r) => (video.readyState >= 2 ? r() : (video.onloadeddata = () => r())));
  const [width, height] = sourceSize(video);
  return {
    kind: 'webcam', name: 'Camera', el: video, width, height, live: true, video,
    dispose: () => { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
  };
}
