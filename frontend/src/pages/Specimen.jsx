import { useMemo, useState } from 'react';
import { PROFILES, PROFILE_ORDER } from '@flowread/core/profiles.js';
import DocRenderer from '../access/shared/DocRenderer.jsx';
import { usePrefs, webSettingsForProfile } from '../access/reader/readerPrefs.js';

// "Try it live": the original FlowRead hero demo. Type or paste anything and
// see it set in each reading profile, including the Focus profile's blurred
// focus line.

const SAMPLE =
  'A cell that doubles in width gains four times the surface but eight times the volume. Past a certain size, its membrane can no longer bring in food and oxygen fast enough, so the cell divides instead of growing.';

const CAPTION = {
  standard: 'Literata, medium bold word starts',
  dyslexia: 'Atkinson Hyperlegible, light bold starts, wide spacing, cream page',
  focus: 'Lexend, strong bold starts, a focus line that blurs the rest',
  screenreader: 'No visual extras, clear structure',
  lowvision: 'Large text, high contrast',
};

function toDoc(text) {
  const paras = String(text || '')
    .split(/\n\s*\n/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    id: 'demo',
    title: 'Demo',
    lang: 'en',
    sections: [
      {
        id: 'd1',
        heading: '',
        level: 2,
        blocks: (paras.length ? paras : [SAMPLE]).map((t, i) => ({ id: `d${i}`, type: 'paragraph', text: t.slice(0, 1200) })),
      },
    ],
  };
}

export default function Specimen() {
  const prefs = usePrefs();
  const [id, setId] = useState(prefs.chosen ? prefs.profileId : 'standard');
  const [text, setText] = useState('');
  const doc = useMemo(() => toDoc(text), [text]);

  const base = webSettingsForProfile(id);
  const settings = { ...base, plainLanguage: false, readAloud: false };

  return (
    <div className="demo">
      <label className="demo-input">
        <span className="sr-only">Type or paste text to try it</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} rows={3} />
      </label>
      <div className="demo-chips" role="radiogroup" aria-label="See it as">
        {PROFILE_ORDER.map((pid) => (
          <button
            key={pid}
            type="button"
            role="radio"
            aria-checked={id === pid}
            className={`demo-chip${id === pid ? ' is-on' : ''}`}
            onClick={() => setId(pid)}
          >
            {PROFILES[pid].label}
          </button>
        ))}
      </div>
      <div className={`demo-out${settings.focusLine ? ' is-focus' : ''}`} aria-live="polite">
        <DocRenderer doc={doc} profile={settings} showTitle={false} className="demo-doc" />
        {settings.focusLine && <span className="demo-band" aria-hidden="true" />}
      </div>
      <p className="demo-caption">{CAPTION[id]}</p>
    </div>
  );
}
