import { useId, type ReactNode } from 'react';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h2>{title}</h2>
        {action}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** Double-click the label to reset to this value. */
  resetTo?: number;
}

export function Slider({ label, value, min, max, step = 1, format, onChange, resetTo }: SliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider-row">
        <label
          htmlFor={id}
          onDoubleClick={resetTo !== undefined ? () => onChange(resetTo) : undefined}
          title={resetTo !== undefined ? 'Double-click to reset' : undefined}
        >
          {label}
        </label>
        <output htmlFor={id}>{format ? format(value) : value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}

export function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId();
  const hint = options.find((o) => o.value === value)?.hint;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
