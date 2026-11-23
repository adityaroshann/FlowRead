import { useId, useState } from 'react';
import { PROFILES, PROFILE_ORDER } from '../shared/profiles.js';

/** Radiogroup of reading profiles; calls onChoose(id) on submit. */
export default function ProfilePicker({ currentId, firstVisit, onChoose, onCancel, titleId, descId }) {
  const [choice, setChoice] = useState(currentId || 'standard');
  const legendId = useId();

  const submit = (e) => {
    e.preventDefault();
    onChoose(choice);
  };

  return (
    <form className="fra-picker" onSubmit={submit}>
      <h2 id={titleId} className="fra-dialog-title">
        {firstVisit ? 'How would you like to read?' : 'Reading profile'}
      </h2>
      <p id={descId} className="fra-dialog-desc">
        Pick a starting point. You can fine-tune it with “Adjust reading”, and change profile at any time with the
        Profile button. Your choice is saved in this browser.
      </p>
      <fieldset className="fra-fieldset" role="radiogroup" aria-labelledby={legendId}>
        <legend id={legendId} className="fra-legend">
          Reading profile
        </legend>
        <div className="fra-radio-cards">
          {PROFILE_ORDER.map((id) => {
            const p = PROFILES[id];
            const inputId = `${legendId}-${id}`;
            return (
              <div key={id} className={`fra-radio-card${choice === id ? ' is-checked' : ''}`}>
                <input
                  type="radio"
                  id={inputId}
                  name="fra-profile"
                  value={id}
                  checked={choice === id}
                  onChange={() => setChoice(id)}
                  aria-describedby={`${inputId}-d`}
                  data-autofocus={choice === id ? '' : undefined}
                />
                <label htmlFor={inputId}>
                  <span className="fra-radio-title">{p.label}</span>
                  <span className="fra-radio-desc" id={`${inputId}-d`}>
                    {p.description}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      {!firstVisit && choice !== currentId && (
        <p className="fra-note">Switching profile replaces your current adjustments with the profile’s settings.</p>
      )}
      <div className="fra-dialog-actions">
        <button type="submit" className="fra-btn fra-btn-primary">
          Read with {PROFILES[choice]?.label || 'Standard'}
        </button>
        {!firstVisit && (
          <button type="button" className="fra-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
