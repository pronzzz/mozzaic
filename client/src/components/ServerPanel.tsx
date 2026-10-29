import { useEffect, useRef, useState } from 'react';
import type { RGB } from '../lib/color';
import { baseName, download } from '../lib/export';
import { DEFAULT_API, checkHealth, renderVideo } from '../lib/server';
import { Section, Slider } from './controls';
import { IconServer } from './Icons';

interface Props {
  file: File;
  width: number;
  palette: RGB[];
  ordered: boolean;
  onToast: (msg: string) => void;
}

const KEY = 'mozzaic:api';

function loadEndpoint(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_API;
  } catch {
    return DEFAULT_API;
  }
}

/**
 * Optional: send the loaded video to the FastAPI backend for an
 * optical-flow stabilised render with a fixed palette.
 */
export function ServerPanel({ file, width, palette, ordered, onToast }: Props) {
  const [endpoint, setEndpoint] = useState(loadEndpoint);
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [stability, setStability] = useState(0.6);
  const [progress, setProgress] = useState<{ p: number; phase: 'upload' | 'render' } | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, endpoint);
    } catch {
      /* ignore */
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus('checking');
      const h = await checkHealth(endpoint, ctrl.signal);
      if (!ctrl.signal.aborted) setStatus(h.ok ? 'online' : 'offline');
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [endpoint]);

  const start = async () => {
    const job = renderVideo(endpoint, { file, width, palette, dither: ordered ? 'bayer4' : 'none', stability, scale: 4 }, (p, phase) => setProgress({ p, phase }));
    abortRef.current = job.abort;
    setProgress({ p: 0, phase: 'upload' });
    try {
      const blob = await job.promise;
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
      download(blob, `${baseName(file.name)}-mozzaic-stable.${ext}`);
      onToast('Stabilised video downloaded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== 'Cancelled') onToast(msg);
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <Section
      title="Stabilised render"
      action={
        <span className={`status ${status}`} title={`Server ${status}`}>
          <i /> {status}
        </span>
      }
    >
      <p className="hint">
        Renders the whole video on the Python server with one fixed palette and optical-flow stabilisation, so colours
        don’t flicker from frame to frame.
      </p>
      <div className="field">
        <label htmlFor="api-endpoint">Server URL</label>
        <input id="api-endpoint" type="url" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} spellCheck={false} />
      </div>
      <Slider label="Stability" value={stability} min={0} max={1} step={0.05} onChange={setStability} format={(v) => `${Math.round(v * 100)}%`} />
      {progress ? (
        <div className="progress-wrap">
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.p * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className={progress.phase === 'render' ? 'indeterminate' : ''} style={{ width: progress.phase === 'render' ? '100%' : `${progress.p * 100}%` }} />
          </div>
          <div className="row between">
            <span className="hint">{progress.phase === 'upload' ? `Uploading ${Math.round(progress.p * 100)}%` : 'Rendering on server…'}</span>
            <button type="button" className="link" onClick={() => abortRef.current?.()}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn wide" onClick={start} disabled={status !== 'online'}>
          <IconServer /> Render on server
        </button>
      )}
      {status === 'offline' && (
        <p className="hint">
          Start it with <code>uvicorn server.main:app</code> from the repo root.
        </p>
      )}
    </Section>
  );
}
