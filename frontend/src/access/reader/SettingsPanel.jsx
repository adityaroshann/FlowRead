import {
  Label,
  Radio,
  RadioGroup,
  Slider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Switch,
} from 'react-aria-components';
import { Plug, RotateCcw } from 'lucide-react';
import { FONTS, THEMES } from '@flowread/core/profiles.js';
import { THEME_COLORS } from '@flowread/core/readingCss.js';
import { setPrefs, updateSettings, usePrefs, webSettingsForProfile } from './readerPrefs.js';
import { useExtensionStatus } from '../../app/extensionBridge.js';
import { PROFILES } from '@flowread/core/profiles.js';
import { FONT_NAMES, THEME_NAMES } from './labels.js';

const FONT_PREVIEW = {
  system: 'var(--font-system)',
  atkinson: 'var(--font-atkinson)',
  lexend: 'var(--font-lexend)',
  dyslexic: 'var(--font-dyslexic)',
  serif: 'var(--font-body)',
};


function SettingSlider({ label, value, onChange, min, max, step, format }) {
  return (
    <Slider className="slider" value={value} onChange={onChange} minValue={min} maxValue={max} step={step}>
      <Label className="slider-label">{label}</Label>
      <SliderOutput className="slider-output">{({ state }) => format(state.values[0])}</SliderOutput>
      <SliderTrack className="slider-track">
        {({ state }) => (
          <>
            <div className="slider-fill" style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
            <SliderThumb className="slider-thumb" />
          </>
        )}
      </SliderTrack>
    </Slider>
  );
}

function Toggle({ label, hint, isSelected, onChange }) {
  return (
    <Switch className="switch" isSelected={!!isSelected} onChange={onChange}>
      <span className="switch-text">
        <span>{label}</span>
        {hint && <span className="switch-hint">{hint}</span>}
      </span>
      <span className="switch-track" aria-hidden="true" />
    </Switch>
  );
}

export default function SettingsPanel({ children }) {
  const prefs = usePrefs();
  const s = prefs.settings;
  const ext = useExtensionStatus();
  const set = (k) => (v) => updateSettings({ [k]: v });
  const profile = PROFILES[prefs.profileId] || PROFILES.standard;

  return (
    <div className="set">
      {children}

      <RadioGroup className="set-group" value={s.theme} onChange={set('theme')}>
        <Label className="set-label">Theme</Label>
        <div className="set-swatches">
          {THEMES.map((t) => {
            const c = THEME_COLORS[t.id];
            return (
              <Radio key={t.id} value={t.id} className="set-swatch">
                <span className="set-swatch-chip" style={{ background: c.bg, color: c.text, borderColor: c.muted }} aria-hidden="true">
                  Aa
                </span>
                <span className="set-swatch-name">{THEME_NAMES[t.id]}</span>
              </Radio>
            );
          })}
        </div>
      </RadioGroup>

      <RadioGroup className="set-group" value={s.font} onChange={set('font')}>
        <Label className="set-label">Font</Label>
        <div className="set-fonts">
          {FONTS.map((f) => (
            <Radio key={f.id} value={f.id} className="set-font">
              <span style={{ fontFamily: FONT_PREVIEW[f.id] }}>{FONT_NAMES[f.id] || f.label}</span>
            </Radio>
          ))}
        </div>
      </RadioGroup>

      <div className="set-group">
        <SettingSlider label="Text size" value={s.textScale} onChange={set('textScale')} min={0.8} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
        <SettingSlider label="Letter spacing" value={s.letterSpacing} onChange={set('letterSpacing')} min={0} max={0.35} step={0.01} format={(v) => `${v.toFixed(2)} em`} />
        <SettingSlider label="Word spacing" value={s.wordSpacing} onChange={set('wordSpacing')} min={0} max={0.5} step={0.02} format={(v) => `${v.toFixed(2)} em`} />
        <SettingSlider label="Line height" value={s.lineHeight} onChange={set('lineHeight')} min={1.2} max={2.4} step={0.05} format={(v) => v.toFixed(2)} />
        <SettingSlider label="Line length" value={s.measure} onChange={set('measure')} min={40} max={100} step={1} format={(v) => `${Math.round(v)} characters`} />
      </div>

      <div className="set-group set-switches">
        <p className="set-label">Reading aids</p>
        <Toggle label="Focus sessions" hint="One section at a time, with time left" isSelected={s.focusMode} onChange={set('focusMode')} />
        <Toggle label="Section summaries" hint="A short AI summary before each section" isSelected={s.summaries} onChange={set('summaries')} />
        <Toggle label="Reading timer" hint="25 minutes of reading, then a 5-minute break" isSelected={s.readingTimer} onChange={set('readingTimer')} />
        <Toggle label="Read aloud" hint="Word-by-word highlighting as it reads" isSelected={s.readAloud} onChange={set('readAloud')} />
        <Toggle label="Plain language" hint="Simpler rewrites, next to the original" isSelected={s.plainLanguage} onChange={set('plainLanguage')} />
        <Toggle label="Image descriptions" hint="Show descriptions under pictures" isSelected={s.imageDetails} onChange={set('imageDetails')} />
        <Toggle label="Spoken maths" hint="Show how each expression is read" isSelected={s.mathSpoken} onChange={set('mathSpoken')} />
      </div>

      <div className="set-group set-switches">
        <p className="set-label">Focus line</p>
        <Toggle label="Focus line" hint="A reading band that follows your pointer (F)" isSelected={s.focusLine} onChange={set('focusLine')} />
        <RadioGroup className="set-inline" value={String(s.focusLineSize || 2)} onChange={(v) => updateSettings({ focusLineSize: Number(v) })} orientation="horizontal">
          <Label className="set-sublabel">Band height</Label>
          {['1', '2', '3'].map((v) => (
            <Radio key={v} value={v} className="set-chip">
              {v} {v === '1' ? 'line' : 'lines'}
            </Radio>
          ))}
        </RadioGroup>
        <Toggle label="Dim the rest of the page" isSelected={s.focusDim} onChange={set('focusDim')} />
      </div>

      <div className="set-group set-switches">
        <p className="set-label">Interface</p>
        <Toggle label="Reduce motion" isSelected={s.noMotion} onChange={set('noMotion')} />
        <Toggle label="Thick focus outlines" isSelected={s.thickFocus} onChange={set('thickFocus')} />
        <Toggle label="Fewer controls" hint="Hide decoration and extra buttons" isSelected={s.minimalChrome} onChange={set('minimalChrome')} />
      </div>

      <div className="set-foot">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setPrefs((p) => ({ ...p, settings: webSettingsForProfile(p.profileId), chosen: true }))}
        >
          <RotateCcw size={14} aria-hidden="true" /> Reset to {profile.label}
        </button>
        <p className={`set-ext${ext.connected ? ' is-on' : ''}`} role="status">
          <Plug size={14} aria-hidden="true" />
          {ext.connected
            ? `Extension connected${ext.version ? ` (${ext.version})` : ''}. Settings sync both ways.`
            : 'Browser extension not connected.'}
        </p>
      </div>
    </div>
  );
}
