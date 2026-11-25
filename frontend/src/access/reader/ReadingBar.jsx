import { AArrowDown, AArrowUp, Download, Pause, Play, ScanLine, SlidersHorizontal, Sparkles, Square } from 'lucide-react';
import { PROFILES, PROFILE_ORDER } from '@flowread/core/profiles.js';
import { BOLD_INTENSITY } from '@flowread/core/boldStarts.js';
import { chooseProfile, updateSettings } from './readerPrefs.js';
import ReadingTimer from './ReadingTimer.jsx';

// The original FlowRead floating toolbar: one frosted pill at the bottom of
// the page with the few controls people reach for while reading. Everything
// else lives behind "More".

const STRENGTHS = [
  { id: 'off', label: 'Off' },
  { id: 'light', label: 'Light', value: BOLD_INTENSITY.light },
  { id: 'medium', label: 'Medium', value: BOLD_INTENSITY.medium },
  { id: 'strong', label: 'Strong', value: BOLD_INTENSITY.strong },
];

function strengthOf(s) {
  if (!s.boldStarts) return STRENGTHS[0];
  const v = Number(s.boldIntensity) || BOLD_INTENSITY.medium;
  return STRENGTHS.slice(1).reduce((a, b) => (Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a));
}

const SCALE_STEP = 0.1;
const clampScale = (v) => Math.round(Math.min(2, Math.max(0.8, v)) * 100) / 100;

function Tool({ label, shortcut, pressed, onClick, children, disabled, className = '', ...rest }) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={`ftb-btn${pressed ? ' is-on' : ''} ${className}`}
      onClick={onClick}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      aria-keyshortcuts={shortcut}
      title={tip}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

export default function ReadingBar({ prefs, speech, showSpeech, onReadAloud, onMore, onDownload, onSummary, onAnnounce, hidden }) {
  const s = prefs.settings;
  const strength = strengthOf(s);

  const cycleStrength = () => {
    const i = STRENGTHS.findIndex((o) => o.id === strength.id);
    const next = STRENGTHS[(i + 1) % STRENGTHS.length];
    updateSettings(next.id === 'off' ? { boldStarts: false } : { boldStarts: true, boldIntensity: next.value });
    onAnnounce?.(next.id === 'off' ? 'Bold word starts off.' : `Bold word starts: ${next.label.toLowerCase()}.`);
  };
  const setScale = (delta) => {
    const next = clampScale((Number(s.textScale) || 1) + delta);
    updateSettings({ textScale: next });
    onAnnounce?.(`Text size ${Math.round(next * 100)}%.`);
  };

  if (hidden) return null;
  return (
    <div className="ftb" role="toolbar" aria-label="Reading controls">
      <label className="ftb-profile" title="Reading profile">
        <span className="sr-only">Reading profile</span>
        <select
          className="ftb-select"
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

      <span className="ftb-div" aria-hidden="true" />

      <Tool label={`Bold word starts: ${strength.label}. Change`} pressed={strength.id !== 'off'} onClick={cycleStrength} className="ftb-bold">
        <span className="ftb-bold-glyph" aria-hidden="true">
          <b>B</b>o
        </span>
        <span className="ftb-bold-level" aria-hidden="true">
          {strength.label}
        </span>
      </Tool>
      <Tool
        label="Focus line"
        shortcut="F"
        pressed={!!s.focusLine}
        onClick={() => {
          updateSettings({ focusLine: !s.focusLine });
          onAnnounce?.(`Focus line ${s.focusLine ? 'off' : 'on'}.`);
        }}
      >
        <ScanLine size={18} aria-hidden="true" />
      </Tool>
      {showSpeech && (
        <>
          <Tool label={speech.status === 'speaking' ? 'Pause reading aloud' : speech.status === 'paused' ? 'Resume reading aloud' : 'Read aloud'} pressed={speech.status === 'speaking'} onClick={onReadAloud}>
            {speech.status === 'speaking' ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </Tool>
          {speech.status !== 'idle' && (
            <Tool label="Stop reading aloud" onClick={speech.stop}>
              <Square size={15} aria-hidden="true" />
            </Tool>
          )}
        </>
      )}
      <Tool label="Smaller text" onClick={() => setScale(-SCALE_STEP)} disabled={s.textScale <= 0.8}>
        <AArrowDown size={18} aria-hidden="true" />
      </Tool>
      <Tool label="Larger text" onClick={() => setScale(SCALE_STEP)} disabled={s.textScale >= 2}>
        <AArrowUp size={18} aria-hidden="true" />
      </Tool>

      {s.readingTimer && (
        <>
          <span className="ftb-div" aria-hidden="true" />
          <ReadingTimer onAnnounce={onAnnounce} />
        </>
      )}

      <span className="ftb-div" aria-hidden="true" />

      <Tool label="Summary" onClick={onSummary}>
        <Sparkles size={18} aria-hidden="true" />
      </Tool>
      <Tool label="More settings" onClick={onMore} aria-haspopup="dialog">
        <SlidersHorizontal size={18} aria-hidden="true" />
      </Tool>
      <Tool label="Download" onClick={onDownload} aria-haspopup="dialog">
        <Download size={18} aria-hidden="true" />
      </Tool>
    </div>
  );
}
