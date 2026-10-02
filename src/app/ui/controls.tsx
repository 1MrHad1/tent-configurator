import { useId, useState, type ReactNode } from 'react';
import { parseColor } from '../../core/color/pantone';
import type { Swatch } from '../../core/product/types';
import { useConfigurator } from '../../core/state/store';
import { Icon } from './Icon';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Range input that records one undo step per gesture: a checkpoint on pointer/key down,
 * then transient updates while scrubbing.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const checkpoint = useConfigurator((s) => s.checkpoint);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        <span className="field-hint">{format ? format(value) : value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={checkpoint}
        onKeyDown={checkpoint}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Swatches, a native picker and a hex / Pantone text field. */
export function ColorField({ value, onChange, swatches, label }: { value: string; onChange: (hex: string) => void; swatches: Swatch[]; label: string }) {
  // A draft belongs to the value it was typed against; when the colour changes elsewhere
  // (a swatch, undo) the field simply shows the new value.
  const [draft, setDraft] = useState<{ for: string; text: string; invalid: boolean } | null>(null);
  const live = draft?.for === value ? draft : null;
  const text = live?.text ?? value.toUpperCase();
  const invalid = live?.invalid ?? false;
  const commit = () => {
    const parsed = parseColor(text);
    if (parsed) {
      setDraft(null);
      onChange(parsed);
    } else setDraft({ for: value, text, invalid: true });
  };
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
      </div>
      <div className="swatches" role="listbox" aria-label={`${label} swatches`}>
        {swatches.map((s) => (
          <button
            key={s.hex}
            type="button"
            role="option"
            aria-selected={s.hex.toLowerCase() === value.toLowerCase()}
            title={`${s.name} ${s.hex.toUpperCase()}`}
            className="swatch"
            style={{ background: s.hex }}
            onClick={() => onChange(s.hex)}
          >
            {s.hex.toLowerCase() === value.toLowerCase() && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
      <div className={`color-input${invalid ? ' is-invalid' : ''}`}>
        <input type="color" aria-label={`${label} picker`} value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          type="text"
          aria-label={`${label} hex or Pantone`}
          value={text}
          placeholder="#E9B44C or Pantone 143 C"
          onChange={(e) => setDraft({ for: value, text: e.target.value, invalid: false })}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </div>
      {invalid && <p className="field-error">Use a hex code (#E9B44C) or a Pantone code (Pantone 143 C).</p>}
    </div>
  );
}

export function IconButton({ icon, label, onClick, disabled, active }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={`icon-button${active ? ' is-on' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
    </button>
  );
}
