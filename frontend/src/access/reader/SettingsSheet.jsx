import { useId } from 'react';
import { FONTS, THEMES, getProfile } from '../shared/profiles.js';

const MEASURES = [
  { value: 55, label: 'Narrow (about 55 characters)' },
  { value: 60, label: 'Medium-narrow (about 60 characters)' },
  { value: 65, label: 'Medium (about 65 characters)' },
  { value: 70, label: 'Medium-wide (about 70 characters)' },
  { value: 80, label: 'Wide (about 80 characters)' },
];

const TOGGLES = [
  { key: 'boldStarts', label: 'Bold word starts', hint: 'Makes the first letters of each word bold.' },
  { key: 'readAloud', label: 'Read-aloud controls', hint: 'Reads the text aloud and highlights the current word.' },
  { key: 'plainLanguage', label: 'Plain-language buttons', hint: 'Shows an AI rewrite next to a paragraph on request.' },
  { key: 'focusMode', label: 'One section at a time', hint: 'Shows a single section with Next and Back.' },
  { key: 'summaries', label: 'Section summaries', hint: 'Shows a short “In this section” summary first.' },
  { key: 'focusLine', label: 'Focus line', hint: 'Dims the page above and below a reading band.' },
  { key: 'imageDetails', label: 'Visible image descriptions', hint: 'Adds a description toggle under each image.' },
  { key: 'mathSpoken', label: 'Show spoken math', hint: 'Shows how each equation is read aloud.' },
  { key: 'noMotion', label: 'No motion', hint: 'Turns off scrolling animations and transitions.' },
  { key: 'thickFocus', label: 'Thick focus rings', hint: 'Makes the keyboard focus outline heavier.' },
  { key: 'minimalChrome', label: 'Minimal interface', hint: 'Hides icons and non-essential extras.' },
  { key: 'announceSections', label: 'Announce sections', hint: 'Screen readers hear the section number when it changes.' },
];

function RadioRow({ name, legend, options, value, onChange }) {
  const legendId = useId();
  return (
    <fieldset className="fra-fieldset" role="radiogroup" aria-labelledby={legendId}>
      <legend id={legendId} className="fra-legend">
        {legend}
      </legend>
      <div className="fra-chip-row">
        {options.map((o) => {
          const id = `${legendId}-${o.id}`;
          return (
            <div key={o.id} className={`fra-chip${value === o.id ? ' is-checked' : ''}`}>
              <input type="radio" id={id} name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
              <label htmlFor={id}>{o.label}</label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function SettingsSheet({ settings, profileId, onChange, onReset, onDone, titleId }) {
  const base = useId();
  const set = (key) => (value) => onChange({ ...settings, [key]: value });
  const pct = Math.round((settings.textScale || 1) * 100);
  const wide = (settings.letterSpacing || 0) >= 0.1;

  return (
    <div className="fra-settings">
      <div className="fra-settings-head">
        <h2 id={titleId} className="fra-dialog-title">
          Adjust reading
        </h2>
        <button type="button" className="fra-btn fra-btn-primary" onClick={onDone} data-autofocus="">
          Done
        </button>
      </div>
      <p className="fra-dialog-desc">Changes apply straight away and are saved in this browser.</p>

      <RadioRow name={`${base}-theme`} legend="Colour theme" options={THEMES} value={settings.theme} onChange={set('theme')} />
      <RadioRow name={`${base}-font`} legend="Font" options={FONTS} value={settings.font} onChange={set('font')} />

      <div className="fra-field">
        <label htmlFor={`${base}-size`} className="fra-legend">
          Text size: <output htmlFor={`${base}-size`}>{pct}%</output>
        </label>
        <input
          id={`${base}-size`}
          type="range"
          min="100"
          max="200"
          step="10"
          value={pct}
          aria-valuetext={`${pct} percent`}
          onChange={(e) => set('textScale')(Number(e.target.value) / 100)}
        />
      </div>

      <div className="fra-field">
        <label htmlFor={`${base}-lh`} className="fra-legend">
          Line spacing: <output htmlFor={`${base}-lh`}>{Number(settings.lineHeight).toFixed(1)}</output>
        </label>
        <input
          id={`${base}-lh`}
          type="range"
          min="1.4"
          max="2.4"
          step="0.1"
          value={settings.lineHeight}
          aria-valuetext={`${Number(settings.lineHeight).toFixed(1)} times the text size`}
          onChange={(e) => set('lineHeight')(Number(e.target.value))}
        />
      </div>

      <div className="fra-field">
        <label htmlFor={`${base}-measure`} className="fra-legend">
          Line length
        </label>
        <select
          id={`${base}-measure`}
          className="fra-select"
          value={MEASURES.some((m) => m.value === settings.measure) ? settings.measure : 65}
          onChange={(e) => set('measure')(Number(e.target.value))}
        >
          {MEASURES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="fra-check">
        <input
          type="checkbox"
          id={`${base}-spacing`}
          checked={wide}
          onChange={(e) =>
            onChange({ ...settings, letterSpacing: e.target.checked ? 0.12 : 0, wordSpacing: e.target.checked ? 0.16 : 0 })
          }
          aria-describedby={`${base}-spacing-h`}
        />
        <label htmlFor={`${base}-spacing`}>Wider letter and word spacing</label>
        <span className="fra-hint" id={`${base}-spacing-h`}>
          Letter spacing 0.12em and word spacing 0.16em, raised together.
        </span>
      </div>

      {TOGGLES.map((t) => (
        <div className="fra-check" key={t.key}>
          <input
            type="checkbox"
            id={`${base}-${t.key}`}
            checked={!!settings[t.key]}
            onChange={(e) => set(t.key)(e.target.checked)}
            aria-describedby={`${base}-${t.key}-h`}
          />
          <label htmlFor={`${base}-${t.key}`}>{t.label}</label>
          <span className="fra-hint" id={`${base}-${t.key}-h`}>
            {t.hint}
          </span>
        </div>
      ))}

      <div className="fra-dialog-actions">
        <button type="button" className="fra-btn" onClick={onReset}>
          Reset to {getProfile(profileId).label} defaults
        </button>
        <button type="button" className="fra-btn fra-btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
