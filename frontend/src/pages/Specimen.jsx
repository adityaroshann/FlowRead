import { useEffect, useMemo, useState } from 'react';
import { Radio, RadioGroup, Label } from 'react-aria-components';
import { Check } from 'lucide-react';
import DocRenderer from '../access/shared/DocRenderer.jsx';
import { PROFILES, PROFILE_ORDER } from '@flowread/core/profiles.js';
import { tokenize } from '@flowread/core/docModel.js';
import { chooseProfile, usePrefs, webSettingsForProfile } from '../access/reader/readerPrefs.js';

const PARA =
  'A cell that doubles in width gains four times the surface but eight times the volume. Past a certain size, its membrane can no longer bring in food and oxygen fast enough, so the cell divides instead of growing.';

const SPECIMEN = {
  id: 'specimen',
  title: 'Specimen',
  lang: 'en',
  sections: [
    {
      id: 'sp1',
      heading: 'Why cells stay small',
      level: 2,
      blocks: [
        {
          id: 'spb1',
          type: 'paragraph',
          text: PARA,
          marks: [{ start: PARA.indexOf('four times'), end: PARA.indexOf('four times') + 10, type: 'bold' }],
        },
        {
          id: 'spb2',
          type: 'list',
          ordered: false,
          items: ['Surface grows with the square of the width.', 'Volume grows with the cube.'],
        },
      ],
    },
  ],
};

const SHORT = {
  standard: 'Comfortable defaults',
  dyslexia: 'Spacing and a calm page',
  focus: 'One section at a time',
  screenreader: 'Quiet, clear structure',
  lowvision: 'Large, high contrast',
};

function reducedMotion() {
  try {
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion')
    );
  } catch {
    return true;
  }
}

/**
 * The landing page's live demo: one paragraph, re-set under each reading
 * profile as you switch. On first view a read-aloud highlight walks through
 * the opening words once, to show word highlighting.
 */
export default function Specimen() {
  const prefs = usePrefs();
  const [id, setId] = useState(prefs.chosen ? prefs.profileId : 'dyslexia');
  const [hl, setHl] = useState(null);
  const words = useMemo(() => tokenize(PARA).filter((t) => !t.space).slice(0, 14), []);

  useEffect(() => {
    if (reducedMotion()) return undefined;
    let i = 0;
    let timer = null;
    const start = setTimeout(function step() {
      if (i >= words.length) {
        setHl(null);
        return;
      }
      const w = words[i];
      setHl({ blockId: 'spb1', start: w.start, length: w.text.length });
      i += 1;
      timer = setTimeout(step, 300);
    }, 900);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, [words]);

  const profile = PROFILES[id];
  const base = webSettingsForProfile(id);
  // Profiles that don't set a theme follow the page's current theme.
  const theme = base.theme === 'light' ? prefs.settings.theme : base.theme;
  const settings = { ...base, theme, plainLanguage: false, readAloud: false };
  const mine = prefs.chosen && prefs.profileId === id;

  return (
    <div className="spec">
      <RadioGroup className="spec-picker" value={id} onChange={setId} orientation="horizontal">
        <Label className="spec-picker-label">See this paragraph as</Label>
        <div className="seg">
          {PROFILE_ORDER.map((pid) => (
            <Radio key={pid} value={pid} className="seg-item">
              {PROFILES[pid].label}
            </Radio>
          ))}
        </div>
      </RadioGroup>

      <div className="spec-page" data-theme-preview={settings.theme}>
        <DocRenderer doc={SPECIMEN} profile={settings} showTitle={false} highlight={hl} className="spec-doc" />
      </div>

      <div className="spec-foot">
        <p className="spec-desc">
          <strong>{SHORT[id]}.</strong> {profile.description}
        </p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => chooseProfile(id)}
        >
          {mine ? (
            <>
              <Check size={14} aria-hidden="true" /> Your reading profile
            </>
          ) : (
            <>Read with {profile.label}</>
          )}
        </button>
      </div>
    </div>
  );
}
