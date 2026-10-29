import { useRef, useState, type ReactNode } from 'react';
import { rgbToHex, type RGB } from '../lib/color';
import { download } from '../lib/export';
import { parsePalette, toGplFile, toHexFile } from '../lib/paletteIO';
import { PALETTES, getPreset } from '../lib/palettes';
import { DITHER_OPTIONS, LOOKS, type PaletteMode, type Settings } from '../lib/settings';
import { Section, Segmented, Select, Slider } from './controls';
import { IconFlip, IconReset, IconRotate } from './Icons';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  palette: RGB[];
  artSize: [number, number];
  sourceWidth: number;
  liveSource: boolean;
  onResample: () => void;
  onToast: (msg: string) => void;
  activeLook: string | null;
  exportPanel: ReactNode;
  serverPanel: ReactNode;
}

const PALETTE_MODES: { value: PaletteMode; label: string }[] = [
  { value: 'preset', label: 'Preset' },
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'levels', label: 'Levels' },
  { value: 'custom', label: 'Custom' },
];

export function Inspector(props: Props) {
  const { settings: s, update, palette, artSize, sourceWidth, activeLook } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [customText, setCustomText] = useState('');

  const importText = (text: string) => {
    const parsed = parsePalette(text);
    if (parsed.length < 2) {
      props.onToast('No colours found. Paste hex codes, a .hex or a .gpl file.');
      return;
    }
    update({ paletteMode: 'custom', customPalette: parsed });
    props.onToast(`Imported ${parsed.length} colours`);
  };

  const copyHex = async (rgb: RGB) => {
    const hex = rgbToHex(rgb);
    try {
      await navigator.clipboard.writeText(hex);
      props.onToast(`Copied ${hex}`);
    } catch {
      props.onToast(hex);
    }
  };

  const toneChanged = s.brightness !== 0 || s.contrast !== 0 || s.saturation !== 1;
  const maxRes = Math.max(16, Math.min(512, sourceWidth || 512));
  const swatchNote =
    s.paletteMode === 'preset'
      ? getPreset(s.presetId).note
      : s.paletteMode === 'adaptive'
        ? `k-means in Oklab · ${palette.length} colours`
        : s.paletteMode === 'levels'
          ? `${s.levels} levels per channel · ${s.levels ** 3} colours`
          : `${palette.length} custom colours`;

  return (
    <aside className="inspector" aria-label="Settings">
      <Section title="Looks">
        <div className="looks">
          {LOOKS.map((l, i) => (
            <button
              type="button"
              key={l.id}
              className={`look ${activeLook === l.id ? 'active' : ''}`}
              onClick={() => update(l.patch)}
              title={`Shortcut: ${i + 1}`}
            >
              <LookSwatch look={l.patch} />
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Pixels"
        action={
          <div className="section-actions">
            <button type="button" className="icon-btn" onClick={() => update({ rotation: ((s.rotation + 1) % 4) as Settings['rotation'] })} aria-label="Rotate 90°" title="Rotate (R)">
              <IconRotate />
            </button>
            <button type="button" className={`icon-btn ${s.flipX ? 'on' : ''}`} onClick={() => update({ flipX: !s.flipX })} aria-label="Mirror horizontally" title="Mirror">
              <IconFlip />
            </button>
          </div>
        }
      >
        <Slider
          label="Resolution"
          value={Math.min(s.resolution, maxRes)}
          min={16}
          max={maxRes}
          onChange={(v) => update({ resolution: v })}
          format={() => `${artSize[0]} × ${artSize[1]}`}
          resetTo={160}
        />
      </Section>

      <Section
        title="Tone"
        action={
          toneChanged ? (
            <button type="button" className="icon-btn" onClick={() => update({ brightness: 0, contrast: 0, saturation: 1 })} aria-label="Reset tone" title="Reset tone">
              <IconReset />
            </button>
          ) : null
        }
      >
        <Slider label="Brightness" value={s.brightness} min={-1} max={1} step={0.02} resetTo={0} onChange={(v) => update({ brightness: v })} format={signed} />
        <Slider label="Contrast" value={s.contrast} min={-1} max={1} step={0.02} resetTo={0} onChange={(v) => update({ contrast: v })} format={signed} />
        <Slider label="Saturation" value={s.saturation} min={0} max={2} step={0.02} resetTo={1} onChange={(v) => update({ saturation: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Section>

      <Section title="Palette">
        <Segmented label="Palette mode" value={s.paletteMode} options={PALETTE_MODES} onChange={(v) => update({ paletteMode: v })} />

        {s.paletteMode === 'preset' && (
          <Select
            label="Preset"
            value={s.presetId}
            options={PALETTES.map((p) => ({ value: p.id, label: `${p.name} · ${p.colors.length}` }))}
            onChange={(v) => update({ presetId: v })}
          />
        )}

        {s.paletteMode === 'adaptive' && (
          <>
            <Slider label="Colours" value={s.adaptiveColors} min={2} max={32} onChange={(v) => update({ adaptiveColors: v })} />
            {props.liveSource && (
              <button type="button" className="btn small ghost" onClick={props.onResample}>
                Re-sample palette from current frame
              </button>
            )}
          </>
        )}

        {s.paletteMode === 'levels' && (
          <Slider label="Levels per channel" value={s.levels} min={2} max={8} onChange={(v) => update({ levels: v })} />
        )}

        {s.paletteMode === 'custom' && (
          <div className="field">
            <label htmlFor="custom-palette">Paste hex codes, .hex or .gpl</label>
            <textarea
              id="custom-palette"
              rows={3}
              placeholder="#1a1c2c #5d275d #b13e53 …"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              spellCheck={false}
            />
            <div className="row">
              <button type="button" className="btn small" onClick={() => importText(customText)} disabled={!customText.trim()}>
                Apply
              </button>
              <button type="button" className="btn small ghost" onClick={() => fileRef.current?.click()}>
                Load file…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".hex,.gpl,.txt,.css,.json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) importText(await f.text());
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        )}

        {s.paletteMode !== 'levels' && (
          <div className="swatches" role="list" aria-label="Palette colours">
            {palette.map((c, i) => (
              <button
                type="button"
                role="listitem"
                key={`${i}-${rgbToHex(c)}`}
                className="swatch"
                style={{ background: rgbToHex(c) }}
                title={`${rgbToHex(c)} · click to copy`}
                onClick={() => copyHex(c)}
              />
            ))}
          </div>
        )}
        <div className="swatch-foot">
          <span className="hint">{swatchNote}</span>
          {s.paletteMode !== 'levels' && (
            <span className="links">
              <button type="button" className="link" onClick={() => download(new Blob([toHexFile(palette)], { type: 'text/plain' }), 'mozzaic-palette.hex')}>
                .hex
              </button>
              <button type="button" className="link" onClick={() => download(new Blob([toGplFile(palette)], { type: 'text/plain' }), 'mozzaic-palette.gpl')}>
                .gpl
              </button>
            </span>
          )}
        </div>
      </Section>

      <Section title="Dither">
        <Select
          label="Pattern"
          value={s.dither}
          options={DITHER_OPTIONS.map((d) => ({ value: d.value, label: d.label, hint: d.hint }))}
          onChange={(v) => update({ dither: v })}
        />
        {s.dither !== 'none' && (
          <Slider label="Strength" value={s.ditherStrength} min={0} max={1} step={0.01} onChange={(v) => update({ ditherStrength: v })} format={(v) => `${Math.round(v * 100)}%`} />
        )}
      </Section>

      {props.exportPanel}
      {props.serverPanel}
    </aside>
  );
}

function signed(v: number) {
  const n = Math.round(v * 100);
  return n > 0 ? `+${n}` : `${n}`;
}

function LookSwatch({ look }: { look: Partial<Settings> }) {
  let colors: string[];
  if (look.paletteMode === 'preset' && look.presetId) {
    const p = getPreset(look.presetId).colors;
    const pick = p.length <= 4 ? p : [p[0], p[Math.floor(p.length * 0.3)], p[Math.floor(p.length * 0.55)], p[Math.floor(p.length * 0.8)]];
    colors = pick.length === 2 ? [pick[0], pick[1], pick[1], pick[0]] : pick;
  } else if (look.paletteMode === 'levels') {
    colors = ['#000000', '#ff0000', '#00ff00', '#0000ff'];
  } else {
    colors = ['#3a1b5c', '#a8326e', '#f2704c', '#ffc56e'];
  }
  return (
    <span className="look-swatch" aria-hidden="true">
      {colors.slice(0, 4).map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  );
}
