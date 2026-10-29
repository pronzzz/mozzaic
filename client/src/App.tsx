import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExportPanel } from './components/ExportPanel';
import { IconCamera, IconCompare, IconGithub, IconGrid, IconKeyboard, IconOpen, IconSparkle, IconUpload, Logo } from './components/Icons';
import { Inspector } from './components/Inspector';
import { ServerPanel } from './components/ServerPanel';
import { Viewport } from './components/Viewport';
import { Kbd } from './components/controls';
import { rgbToHex, type RGB } from './lib/color';
import { baseName, copyPng, download, renderPng, startRecording, type Recording } from './lib/export';
import { extractPalette } from './lib/kmeans';
import { presetRgb } from './lib/palettes';
import { artSizeFor, resolvePalette, type Renderer } from './lib/renderer';
import { DEFAULT_SETTINGS, LOOKS, loadSettings, saveSettings, type Settings } from './lib/settings';
import { ACCEPTED, SAMPLES, isSupportedFile, loadFile, loadSample, openWebcam, type SampleId, type Source } from './lib/sources';

interface Toast {
  id: number;
  text: string;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceKey, setSourceKey] = useState(0);
  const [adaptive, setAdaptive] = useState<RGB[] | null>(null);
  const [compare, setCompare] = useState(false);
  const [grid, setGrid] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [showKeys, setShowKeys] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [resampleNonce, setResampleNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<Source | null>(null);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  useEffect(() => saveSettings(settings), [settings]);

  // ---- source management ---------------------------------------------------

  const adoptSource = useCallback((next: Source) => {
    // The camera turns mirroring on; don't let it stick to the next file.
    if (sourceRef.current?.kind === 'webcam' && next.kind !== 'webcam') {
      setSettings((s) => ({ ...s, flipX: false }));
    }
    sourceRef.current?.dispose();
    sourceRef.current = next;
    setSource(next);
    setSourceKey((k) => k + 1);
    setAdaptive(null);
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (!isSupportedFile(file)) {
        toast('Drop an image or a video file');
        return;
      }
      setBusy(true);
      try {
        adoptSource(await loadFile(file));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not open that file');
      } finally {
        setBusy(false);
      }
    },
    [toast, adoptSource],
  );

  const openSample = useCallback((id: SampleId) => adoptSource(loadSample(id)), [adoptSource]);

  const startCamera = async () => {
    setBusy(true);
    try {
      adoptSource(await openWebcam());
      update({ flipX: true });
    } catch (e) {
      toast(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was denied' : e instanceof Error ? e.message : 'Camera unavailable');
    } finally {
      setBusy(false);
    }
  };

  // First visit: show something.
  useEffect(() => {
    if (!sourceRef.current) openSample('sunset');
    return () => sourceRef.current?.dispose();
  }, [openSample]);

  // ---- renderer wiring -----------------------------------------------------

  useEffect(() => {
    renderer?.setSource(source?.el ?? null, source?.live ?? false);
  }, [renderer, source]);

  useEffect(() => {
    renderer?.setSettings(settings);
  }, [renderer, settings]);

  // Adaptive palette: computed from the prepared (resized + toned) image,
  // so it reacts to tone changes. Live sources only re-sample on request.
  const toneKey = `${settings.brightness}|${settings.contrast}|${settings.saturation}|${settings.resolution}|${settings.rotation}`;
  const liveToneKey = source?.live ? '' : toneKey;
  useEffect(() => {
    if (!renderer || !source || settings.paletteMode !== 'adaptive') return;
    const t = setTimeout(() => {
      const px = renderer.readPrepared();
      setAdaptive(extractPalette(px, settings.adaptiveColors));
    }, 90);
    return () => clearTimeout(t);
  }, [renderer, source, settings.paletteMode, settings.adaptiveColors, liveToneKey, resampleNonce]);

  const palette = useMemo(
    () => resolvePalette(settings, presetRgb(settings.presetId), adaptive),
    [settings, adaptive],
  );
  const paletteKey = palette.map(rgbToHex).join('');
  useEffect(() => {
    renderer?.setPalette(palette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, paletteKey]);

  // Frame time for the stats chip (sampled, not every frame).
  useEffect(() => {
    if (!renderer) return;
    const id = setInterval(() => setFrameMs(renderer.lastFrameMs), 500);
    return () => clearInterval(id);
  }, [renderer]);

  const artSize = useMemo<[number, number]>(
    () => (source ? artSizeFor(source.width, source.height, settings) : [0, 0]),
    [source, settings],
  );
  const displayWidth = source ? (settings.rotation % 2 ? source.height : source.width) : 512;

  const activeLook = useMemo(() => {
    const match = LOOKS.find((l) =>
      Object.entries(l.patch).every(([k, v]) => k === 'resolution' || settings[k as keyof Settings] === v),
    );
    return match?.id ?? null;
  }, [settings]);

  // ---- export ----------------------------------------------------------------

  const fileStem = source ? baseName(source.name) : 'mozzaic';

  const exportPng = useCallback(async () => {
    if (!renderer || !source) return;
    const blob = await renderPng(renderer, settings.exportScale);
    download(blob, `${fileStem}-mozzaic-${artSize[0]}x${artSize[1]}@${settings.exportScale}x.png`);
    toast('PNG saved');
  }, [renderer, source, settings.exportScale, fileStem, artSize, toast]);

  const copy = useCallback(async () => {
    if (!renderer) return;
    try {
      await copyPng(renderer, settings.exportScale);
      toast('Copied PNG to clipboard');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Copy failed');
    }
  }, [renderer, settings.exportScale, toast]);

  const toggleRecord = useCallback(() => {
    if (recording) {
      recording.stop();
      return;
    }
    if (!renderer || !source) return;
    try {
      const video = source.video && source.kind === 'video' ? source.video : null;
      if (video) video.currentTime = 0;
      const rec = startRecording(renderer, settings.exportScale);
      setRecording(rec);
      setRecSeconds(0);
      const started = performance.now();
      const tick = setInterval(() => setRecSeconds((performance.now() - started) / 1000), 200);
      // Video files: record exactly one loop.
      const auto = video && Number.isFinite(video.duration) ? setTimeout(rec.stop, video.duration * 1000) : null;
      rec.done.then(({ blob, ext }) => {
        clearInterval(tick);
        if (auto) clearTimeout(auto);
        setRecording(null);
        if (blob.size > 0) {
          download(blob, `${fileStem}-mozzaic.${ext}`);
          toast('Recording saved');
        }
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Recording failed');
    }
  }, [recording, renderer, source, settings.exportScale, fileStem, toast]);

  // ---- drag & drop, paste, keyboard -------------------------------------------

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) openFile(f);
    };
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea')) return;
      const f = Array.from(e.clipboardData?.files ?? []).find(isSupportedFile);
      if (f) {
        e.preventDefault();
        openFile(f);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, [openFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input:not([type=range]), textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'o') fileRef.current?.click();
      else if (k === 'e') exportPng();
      else if (k === 'c') setCompare((v) => !v);
      else if (k === 'g') setGrid((v) => !v);
      else if (k === 'r') setSettings((s) => ({ ...s, rotation: ((s.rotation + 1) % 4) as Settings['rotation'] }));
      else if (k === 'f') setFitNonce((n) => n + 1);
      else if (k === '[') setSettings((s) => ({ ...s, resolution: Math.max(16, s.resolution - 8) }));
      else if (k === ']') setSettings((s) => ({ ...s, resolution: Math.min(512, s.resolution + 8) }));
      else if (k === '?') setShowKeys((v) => !v);
      else if (k === 'escape') setShowKeys(false);
      else if (/^[1-8]$/.test(k)) update(LOOKS[Number(k) - 1].patch);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exportPng, update]);

  // ---- render ------------------------------------------------------------------

  const ordered = !['floyd', 'atkinson', 'sierra'].includes(settings.dither) && settings.dither !== 'none';
  const stats = source ? (
    <>
      <span className="stat-name" title={source.name}>
        {source.name}
      </span>
      <span>
        {artSize[0]}×{artSize[1]}
      </span>
      <span>{settings.paletteMode === 'levels' ? `${settings.levels ** 3}` : palette.length} colours</span>
      <span>{frameMs.toFixed(1)} ms</span>
    </>
  ) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="wordmark">Mozzaic</span>
          <span className="tag">pixel art engine</span>
        </div>

        <div className="topbar-actions">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} title="Open image or video (O)">
            <IconOpen /> <span className="hide-sm">Open</span>
          </button>
          <button type="button" className="btn" onClick={startCamera} title="Use your camera">
            <IconCamera /> <span className="hide-sm">Camera</span>
          </button>
          <div className="samples" role="group" aria-label="Samples">
            <IconSparkle />
            {SAMPLES.map((s) => (
              <button key={s.id} type="button" className="chip" onClick={() => openSample(s.id)} title={s.note}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="topbar-right">
          <button type="button" className={`icon-btn ${compare ? 'on' : ''}`} onClick={() => setCompare((v) => !v)} aria-pressed={compare} title="Before / after (C)">
            <IconCompare />
          </button>
          <button type="button" className={`icon-btn ${grid ? 'on' : ''}`} onClick={() => setGrid((v) => !v)} aria-pressed={grid} title="Pixel grid (G)">
            <IconGrid />
          </button>
          <button type="button" className="icon-btn hide-sm" onClick={() => setShowKeys((v) => !v)} title="Keyboard shortcuts (?)">
            <IconKeyboard />
          </button>
          <a className="icon-btn hide-sm" href="https://github.com/pronzzz/mozzaic" target="_blank" rel="noreferrer" title="Source on GitHub">
            <IconGithub />
          </a>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = '';
          }}
        />
      </header>

      <main className="workspace">
        <Viewport
          compare={compare}
          grid={grid}
          onRenderer={setRenderer}
          onError={toast}
          stats={stats}
          fitKey={`${sourceKey}:${fitNonce}`}
        >
          {busy && <div className="busy">Loading…</div>}
          {recording && (
            <div className="rec-pill">
              <i /> REC {recSeconds.toFixed(1)}s
            </div>
          )}
        </Viewport>

        <Inspector
          settings={settings}
          update={update}
          palette={palette}
          artSize={artSize}
          sourceWidth={displayWidth}
          liveSource={!!source?.live}
          onResample={() => setResampleNonce((n) => n + 1)}
          onToast={toast}
          activeLook={activeLook}
          exportPanel={
            <ExportPanel
              scale={settings.exportScale}
              onScale={(n) => update({ exportScale: n })}
              artSize={artSize}
              disabled={!source || !renderer}
              recording={!!recording}
              recordLabel={recording ? 'Stop' : source?.kind === 'video' ? 'Record loop' : 'Record'}
              onPng={exportPng}
              onCopy={copy}
              onRecord={toggleRecord}
            />
          }
          serverPanel={
            source?.kind === 'video' && source.file ? (
              <ServerPanel file={source.file} width={artSize[0]} palette={palette.length <= 64 ? palette : []} ordered={ordered} onToast={toast} />
            ) : null
          }
        />
      </main>

      {dragging && (
        <div className="drop-overlay">
          <div>
            <IconUpload width={28} height={28} />
            <strong>Drop to pixelate</strong>
            <span>Images and videos stay on your device</span>
          </div>
        </div>
      )}

      {showKeys && (
        <div className="modal-backdrop" onClick={() => setShowKeys(false)}>
          <div className="modal" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <h2>Shortcuts</h2>
            <dl className="keys">
              <dt><Kbd>O</Kbd></dt><dd>Open file (or drop / paste anywhere)</dd>
              <dt><Kbd>E</Kbd></dt><dd>Export PNG</dd>
              <dt><Kbd>C</Kbd></dt><dd>Before / after compare</dd>
              <dt><Kbd>G</Kbd></dt><dd>Pixel grid</dd>
              <dt><Kbd>R</Kbd></dt><dd>Rotate 90°</dd>
              <dt><Kbd>F</Kbd></dt><dd>Fit to screen (or double-click)</dd>
              <dt><Kbd>[</Kbd> <Kbd>]</Kbd></dt><dd>Resolution − / +</dd>
              <dt><Kbd>1</Kbd>–<Kbd>8</Kbd></dt><dd>Apply a look</dd>
            </dl>
            <p className="hint">Scroll to zoom, drag to pan. Settings are saved in this browser.</p>
            <button type="button" className="btn" onClick={() => { setSettings(DEFAULT_SETTINGS); setShowKeys(false); toast('Settings reset'); }}>
              Reset all settings
            </button>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
