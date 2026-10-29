import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Renderer } from '../lib/renderer';
import { IconFit, IconMinus, IconPlus } from './Icons';

interface Props {
  compare: boolean;
  grid: boolean;
  onRenderer: (r: Renderer | null) => void;
  onError: (message: string) => void;
  stats: ReactNode;
  children?: ReactNode;
  /** Bumps when the art size changes so we can re-fit. */
  fitKey: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 48;

export function Viewport({ compare, grid, onRenderer, onError, stats, children, fitKey }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [zoom, setZoom] = useState(1);
  const [split, setSplit] = useState(0.5);
  const [failed, setFailed] = useState<string | null>(null);

  // Create the renderer once.
  useEffect(() => {
    const canvas = canvasRef.current!;
    try {
      const r = new Renderer(canvas);
      rendererRef.current = r;
      onRenderer(r);
      return () => {
        onRenderer(null);
        r.dispose();
        rendererRef.current = null;
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFailed(msg);
      onError(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      rendererRef.current?.resize(width, height, Math.min(window.devicePixelRatio || 1, 3));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    rendererRef.current?.setView({ compare, grid, split });
  }, [compare, grid, split]);

  // New image or resolution → back to fit.
  useEffect(() => {
    rendererRef.current?.setView({ zoom: 1, panX: 0, panY: 0 });
    setZoom(1);
  }, [fitKey]);

  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const r = rendererRef.current;
    const wrap = wrapRef.current;
    if (!r || !wrap) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const rect = wrap.getBoundingClientRect();
    const mx = cx ?? rect.width / 2;
    const my = cy ?? rect.height / 2;
    const before = r.viewTransform();
    const ax = (mx - before.offsetX) / before.scale;
    const ay = (my - before.offsetY) / before.scale;
    r.setView({ zoom: z, panX: 0, panY: 0 });
    const base = r.viewTransform();
    r.setView({ panX: mx - ax * base.scale - base.offsetX, panY: my - ay * base.scale - base.offsetY });
    setZoom(z);
  };

  const fit = () => {
    rendererRef.current?.setView({ zoom: 1, panX: 0, panY: 0 });
    setZoom(1);
  };

  // Wheel zoom (needs a non-passive listener to preventDefault).
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAt(r.getView().zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to pan, or drag the compare handle.
  const drag = useRef<{ mode: 'pan' | 'split'; x: number; y: number; panX: number; panY: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const r = rendererRef.current;
    if (!r || e.button !== 0) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const onHandle = compare && Math.abs(e.clientX - rect.left - split * rect.width) < 14;
    const v = r.getView();
    drag.current = { mode: onHandle ? 'split' : 'pan', x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = rendererRef.current;
    if (!d || !r) return;
    if (d.mode === 'split') {
      const rect = wrapRef.current!.getBoundingClientRect();
      setSplit(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    } else {
      r.setView({ panX: d.panX + e.clientX - d.x, panY: d.panY + e.clientY - d.y });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="viewport" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="viewport-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fit}
        aria-label="Pixel art preview. Scroll to zoom, drag to pan, double-click to fit."
        role="img"
      />

      {failed && (
        <div className="viewport-error">
          <strong>Can’t start the renderer</strong>
          <p>{failed} Mozzaic needs a browser with WebGL2 (any recent Chrome, Edge, Firefox or Safari).</p>
        </div>
      )}

      {compare && (
        <>
          <div className="compare-handle" style={{ left: `${split * 100}%` }} aria-hidden="true">
            <span />
          </div>
          <span className="compare-label left">Original</span>
          <span className="compare-label right">Mozzaic</span>
        </>
      )}

      <div className="viewport-stats">{stats}</div>

      <div className="zoom-controls">
        <button type="button" className="icon-btn" onClick={() => zoomAt(zoom / 1.5)} aria-label="Zoom out">
          <IconMinus />
        </button>
        <button type="button" className="zoom-value" onClick={fit} title="Fit to screen (F)">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomAt(zoom * 1.5)} aria-label="Zoom in">
          <IconPlus />
        </button>
        <button type="button" className="icon-btn" onClick={fit} aria-label="Fit to screen">
          <IconFit />
        </button>
      </div>

      {children}
    </div>
  );
}
