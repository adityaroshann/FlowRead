// Small accessible controls shared by the popup and the options page.
import { useId } from 'react';
import { PROFILES, PROFILE_ORDER, type ProfileId } from '@flowread/core';

export function Switch({
  label,
  checked,
  onChange,
  description,
  disabled,
  big,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
  big?: boolean;
}) {
  const id = useId();
  return (
    <div className={`switch-row${big ? ' big' : ''}`}>
      <span className="switch-text">
        <span id={`${id}-l`} className="switch-label">
          {label}
        </span>
        {description && (
          <span id={`${id}-d`} className="switch-desc">
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{label}</span>
        <output htmlFor={id}>{format(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ProfilePicker({
  value,
  onChange,
  compact,
}: {
  value: ProfileId | 'custom';
  onChange: (id: ProfileId) => void;
  compact?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={`profiles${compact ? ' compact' : ''}`}>
      <legend>Reading profile</legend>
      {PROFILE_ORDER.map((id) => {
        const p = PROFILES[id];
        return (
          <label key={id} className="profile-card">
            <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />
            <span className="profile-name">{p.label}</span>
            {!compact && <span className="profile-desc">{p.description}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const em = (v: number) => (v === 0 ? 'Normal' : `+${v.toFixed(2)} em`);
export const times = (v: number) => `${v.toFixed(1)}×`;

const STRENGTHS = [
  { label: 'Light', value: 0.35 },
  { label: 'Medium', value: 0.45 },
  { label: 'Strong', value: 0.55 },
];

/** Light / Medium / Strong for bold word starts (native radios, so it is keyboard and screen-reader friendly). */
export function BoldStrength({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const near = STRENGTHS.reduce((a, b) => (Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a));
  return (
    <fieldset className="seg">
      <legend className="seg-legend">Bold strength</legend>
      {STRENGTHS.map((o) => (
        <label key={o.label} className="seg-opt">
          <input type="radio" name="bold-strength" checked={near.value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
