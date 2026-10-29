import { rgbToHex, type RGB } from './color';

/** Client for the optional FastAPI backend (optical-flow video renders). */

export const DEFAULT_API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

export interface ServerHealth {
  ok: boolean;
  version?: string;
}

export async function checkHealth(base: string, signal?: AbortSignal): Promise<ServerHealth> {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { signal });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { status?: string; version?: string };
    return { ok: body.status === 'ok', version: body.version };
  } catch {
    return { ok: false };
  }
}

export interface VideoJob {
  file: File;
  width: number;
  /** Up to 64 colours; empty lets the server choose. */
  palette: RGB[];
  dither: 'none' | 'bayer4';
  stability: number; // 0..1
  scale: number;
}

/** Upload a video and get the stabilised render back. Reports upload progress 0..1. */
export function renderVideo(base: string, job: VideoJob, onProgress: (p: number, phase: 'upload' | 'render') => void): { promise: Promise<Blob>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Blob>((resolve, reject) => {
    const form = new FormData();
    form.append('file', job.file);
    const params = new URLSearchParams({
      width: String(job.width),
      dither: job.dither,
      stability: job.stability.toFixed(2),
      scale: String(job.scale),
    });
    // Empty palette → the server picks one with k-means over the whole clip.
    if (job.palette.length >= 2) params.set('palette', job.palette.map((c) => rgbToHex(c).slice(1)).join(','));
    xhr.open('POST', `${base.replace(/\/$/, '')}/process/video?${params}`);
    xhr.responseType = 'blob';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total, 'upload');
    xhr.upload.onload = () => onProgress(1, 'render');
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as Blob);
      let detail = `Server error ${xhr.status}`;
      try {
        const body = JSON.parse(await (xhr.response as Blob).text()) as { detail?: unknown };
        if (typeof body.detail === 'string') detail = body.detail;
      } catch {
        /* keep generic message */
      }
      reject(new Error(detail));
    };
    xhr.onerror = () => reject(new Error('Could not reach the server.'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
