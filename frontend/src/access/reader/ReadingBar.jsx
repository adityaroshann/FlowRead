import { AArrowDown, AArrowUp, Download, Pause, Play, ScanLine, SlidersHorizontal, Square } from 'lucide-react';
import { PROFILES, PROFILE_ORDER } from '@flowread/core/profiles.js';
import { BOLD_INTENSITY } from '@flowread/core/boldStarts.js';
import { chooseProfile, updateSettings } from './readerPrefs.js';
import ReadingTimer from './ReadingTimer.jsx';

// The few controls people reach for while reading, always in view.
// Everything else lives behind "More".

const STRENGTHS = [
  { id: 'off', label: 'Off' },
  { id: 'light', label: 'Light', value: BOLD_INTENSITY.light },
  { id: 'medium', label: 'Medium', value: BOLD_INTENSITY.medium },
  { id: 'strong', label: 'Strong', value: BOLD_INTENSITY.strong },
];

function strengthOf(s) {
  if (!s.boldStarts) return 'off';
  const v = Number(s.boldIntensity) || BOLD_INTENSITY.medium;
  return STRENGTHS.slice(1).reduce((a, b) => (Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a)).id;
}

const SCALE_STEP = 0.1;
const clampScale = (v) => Math.round(Math.min(2, Math.max(0.8, v)) * 100) / 100;

export default function ReadingBar({ prefs, speech, showSpeech, onReadAloud, onMore, onDownload, onAnnounce }) {
  const s = prefs.settings;
  const strength = strengthOf(s);

  const setStrength = (id) => {
    const opt = STRENGTHS.find((o) => o.id === id);
    updateSettings(id === 'off' ? { boldStarts: false } : { boldStarts: true, boldIntensity: opt.value });
    onAnnounce?.(id === 'off' ? 'Bold word starts off.' : `Bold word starts: ${opt.label.toLowerCase()}.`);
  };
  const setScale = (delta) => {
    const next = clampScale((Number(s.textScale) || 1) + delta);
    updateSettings({ textScale: next });
    onAnnounce?.(`Text size ${Math.round(next * 100)}%.`);
  };

  return (
    <div className="rbar" role="toolbar" aria-label="Reading controls">
      <label className="rbar-profile">
        <span className="sr-only">Reading profile</span>
        <select
          className="rbar-select"
          value={prefs.profileId}
          onChange={(e) => {
            chooseProfile(e.target.value);
            onAnnounce?.(`${PROFILES[e.target.value].label} profile on.`);
          }}
        >
          {PROFILE_ORDER.map((id) => (
            <option key={id} value={id}>
              {PROFILES[id].label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="rbar-seg" aria-label="Bold word starts">
        <legend className="sr-only">Bold word starts</legend>
        <span className="rbar-seg-label" aria-hidden="true">
          <b>Bo</b>ld
        </span>
        {STRENGTHS.map((o) => (
          <label key={o.id} className="rbar-seg-opt" title={o.id === 'off' ? 'Bold word starts off' : `${o.label} bold word starts`}>
            <input type="radio" name="rbar-bold" checked={strength === o.id} onChange={() => setStrength(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className={`btn btn-sm rbar-toggle${s.focusLine ? ' is-on' : ''}`}
        aria-pressed={!!s.focusLine}
        aria-keyshortcuts="F"
        title="Focus line: a reading band that follows your pointer (F)"
        onClick={() => {
          updateSettings({ focusLine: !s.focusLine });
          onAnnounce?.(`Focus line ${s.focusLine ? 'off' : 'on'}.`);
        }}
      >
        <ScanLine size={16} aria-hidden="true" />
        <span className="rbar-text">Focus line</span>
      </button>

      {showSpeech && (
        <div className="rbar-group" role="group" aria-label="Read aloud">
          <button
            type="button"
            className={`btn btn-sm rbar-toggle${speech.status === 'speaking' ? ' is-on' : ''}`}
            onClick={onReadAloud}
            aria-pressed={speech.status === 'speaking'}
            title="Read aloud from here, with each word highlighted"
          >
            {speech.status === 'speaking' ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            <span className="rbar-text">{speech.status === 'speaking' ? 'Pause' : speech.status === 'paused' ? 'Resume' : 'Read aloud'}</span>
          </button>
          {speech.status !== 'idle' && (
            <button type="button" className="btn btn-sm btn-icon" onClick={speech.stop} aria-label="Stop reading" title="Stop">
              <Square size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="rbar-group rbar-size" role="group" aria-label="Text size">
        <button type="button" className="btn btn-sm btn-icon" onClick={() => setScale(-SCALE_STEP)} disabled={s.textScale <= 0.8} aria-label="Smaller text" title="Smaller text">
          <AArrowDown size={17} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-sm btn-icon" onClick={() => setScale(SCALE_STEP)} disabled={s.textScale >= 2} aria-label="Larger text" title="Larger text">
          <AArrowUp size={17} aria-hidden="true" />
        </button>
      </div>

      {s.readingTimer && <ReadingTimer onAnnounce={onAnnounce} />}

      <span className="rbar-spacer" aria-hidden="true" />

      <button type="button" className="btn btn-sm" onClick={onMore} aria-haspopup="dialog" title="Theme, font, spacing and more">
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span className="rbar-text">More</span>
      </button>
      <button type="button" className="btn btn-sm" onClick={onDownload} aria-haspopup="dialog" title="Download as PDF, Word or HTML">
        <Download size={16} aria-hidden="true" />
        <span className="rbar-text">Download</span>
      </button>
    </div>
  );
}
