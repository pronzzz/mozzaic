import { Section } from './controls';
import { IconCopy, IconDownload, IconRecord, IconStop } from './Icons';

interface Props {
  scale: number;
  onScale: (n: number) => void;
  artSize: [number, number];
  disabled: boolean;
  recording: boolean;
  recordLabel: string;
  onPng: () => void;
  onCopy: () => void;
  onRecord: () => void;
}

const SCALES = [1, 2, 4, 8, 12, 16];

export function ExportPanel({ scale, onScale, artSize, disabled, recording, recordLabel, onPng, onCopy, onRecord }: Props) {
  const [w, h] = artSize;
  return (
    <Section title="Export">
      <div className="field">
        <span className="field-label" id="scale-label">
          Upscale <span className="muted">· {w * scale} × {h * scale}px</span>
        </span>
        <div className="chips" role="radiogroup" aria-labelledby="scale-label">
          {SCALES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={scale === n} className={`chip ${scale === n ? 'active' : ''}`} onClick={() => onScale(n)}>
              {n}×
            </button>
          ))}
        </div>
      </div>
      <div className="export-actions">
        <button type="button" className="btn primary" onClick={onPng} disabled={disabled}>
          <IconDownload /> PNG
        </button>
        <button type="button" className="btn" onClick={onCopy} disabled={disabled} title="Copy PNG to clipboard">
          <IconCopy /> Copy
        </button>
        <button type="button" className={`btn ${recording ? 'danger' : ''}`} onClick={onRecord} disabled={disabled && !recording}>
          {recording ? <IconStop /> : <IconRecord />} {recordLabel}
        </button>
      </div>
      <p className="hint">Exports are nearest-neighbour scaled, so every art pixel stays a crisp square.</p>
    </Section>
  );
}
