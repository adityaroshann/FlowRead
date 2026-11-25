import { useState } from 'react';
import { BookOpenText, Plus, Trash2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { FONTS, FONT_FAMILIES, THEMES, THEME_COLORS, boldSegments, type Settings } from '@flowread/core';
import { KEYS } from '../../src/lib/store';
import { originOf, originPattern, sanitizeSites, type SiteList } from '../../src/lib/schema';
import { ProfilePicker, Slider, Switch, em, pct, times } from '../../src/ui/controls';
import { useExtensionState } from '../../src/ui/useExtensionState';

const ALL = ['http://*/*', 'https://*/*'];
const SAMPLE = 'Reading should feel calm. FlowRead changes the font, spacing and colours of any page to match the way you read best.';

const APP_SWITCHES: [keyof Settings, string, string][] = [
  ['readAloud', 'Read-aloud controls', 'Show read-aloud with word highlighting in the FlowRead reader.'],
  ['plainLanguage', 'Plain-language buttons', 'Offer an AI plain-language rewrite next to each paragraph.'],
  ['focusMode', 'One section at a time', 'Show documents a section at a time with Next and Back.'],
  ['summaries', 'Section summaries', 'Show a short "In this section" box before each section.'],
  ['minimalChrome', 'Minimal interface', 'Hide decorative and non-essential controls.'],
  ['imageDetails', 'Image descriptions', 'Show a visible description under each figure.'],
  ['mathSpoken', 'Spoken maths', 'Show the spoken reading of each formula as text.'],
  ['announceSections', 'Announce sections', 'Announce section counts and changes to screen readers.'],
];

export function App() {
  const ext = useExtensionState();
  const [newSite, setNewSite] = useState('');
  const [msg, setMsg] = useState('');
  const s = ext.synced?.settings;
  if (!ext.synced || !s) return null;

  const saveSites = (list: SiteList) => {
    const clean = sanitizeSites(list);
    ext.setSitesLocal(clean);
    void browser.storage.local.set({ [KEYS.sites]: clean });
    return clean;
  };

  // permissions.request is called synchronously in each click handler.
  const setAll = (on: boolean) => {
    const prev = ext.sites;
    saveSites({ ...prev, all: on });
    if (!on) {
      void browser.permissions.remove({ origins: ALL }).catch(() => {});
      setMsg('FlowRead no longer switches on everywhere.');
      return;
    }
    void browser.permissions.request({ origins: ALL }).then((granted) => {
      if (!granted) {
        saveSites(prev);
        setMsg('Permission was not granted, so FlowRead will only run when you switch it on.');
      } else setMsg('FlowRead now switches on by itself on every site.');
    });
  };

  const addSite = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newSite.trim();
    const origin = originOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!origin) {
      setMsg('Enter a web address such as example.org.');
      return;
    }
    const prev = ext.sites;
    saveSites({ ...prev, sites: [...prev.sites, origin] });
    void browser.permissions.request({ origins: [originPattern(origin)] }).then((granted) => {
      if (!granted) {
        saveSites(prev);
        setMsg(`Permission for ${origin} was not granted.`);
      } else {
        setNewSite('');
        setMsg(`${new URL(origin).host} added.`);
      }
    });
  };

  const removeSite = (origin: string) => {
    saveSites({ ...ext.sites, sites: ext.sites.sites.filter((x) => x !== origin) });
    void browser.permissions.remove({ origins: [originPattern(origin)] }).catch(() => {});
    setMsg(`${new URL(origin).host} removed.`);
  };

  const c = THEME_COLORS[s.theme] ?? THEME_COLORS.light;

  return (
    <main className="options">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BookOpenText size={18} />
        </span>
        <h1>FlowRead settings</h1>
      </header>
      <p className="muted">
        These settings are shared with the FlowRead web app and sync through your browser account. Changes apply to open pages straight away.
      </p>

      <section>
        <ProfilePicker value={ext.synced.profileId} onChange={ext.chooseProfile} />
      </section>

      <section className="stack" aria-labelledby="h-text">
        <h2 id="h-text">Text and layout</h2>
        <div
          className="preview"
          aria-label="Preview"
          style={{
            background: c.bg,
            color: c.text,
            fontFamily: FONT_FAMILIES[s.font],
            fontSize: `${17 * s.textScale}px`,
            letterSpacing: `${s.letterSpacing}em`,
            wordSpacing: `${s.wordSpacing}em`,
            lineHeight: s.lineHeight,
            maxWidth: `${s.measure}ch`,
          }}
        >
          {s.boldStarts
            ? boldSegments(SAMPLE).map((seg, i) => (seg.bold ? <b key={i}>{seg.text}</b> : <span key={i}>{seg.text}</span>))
            : SAMPLE}
        </div>
        <div className="grid2">
          <div className="select-field">
            <label htmlFor="theme">Colours</label>
            <select id="theme" value={s.theme} onChange={(e) => ext.patchSettings({ theme: e.target.value as Settings['theme'] })}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="select-field">
            <label htmlFor="font">Font</label>
            <select id="font" value={s.font} onChange={(e) => ext.patchSettings({ font: e.target.value as Settings['font'] })}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <Slider label="Text size" value={s.textScale} min={0.8} max={2} step={0.1} format={pct} onChange={(v) => ext.patchSettings({ textScale: v })} />
          <Slider label="Letter spacing" value={s.letterSpacing} min={0} max={0.35} step={0.01} format={em} onChange={(v) => ext.patchSettings({ letterSpacing: v })} />
          <Slider label="Word spacing" value={s.wordSpacing} min={0} max={0.5} step={0.02} format={em} onChange={(v) => ext.patchSettings({ wordSpacing: v })} />
          <Slider label="Line spacing" value={s.lineHeight} min={1.2} max={2.4} step={0.1} format={times} onChange={(v) => ext.patchSettings({ lineHeight: v })} />
          <Slider label="Line length" value={s.measure} min={40} max={100} step={5} format={(v) => `${v} characters`} onChange={(v) => ext.patchSettings({ measure: v })} />
        </div>
      </section>

      <section className="stack" aria-labelledby="h-aids">
        <h2 id="h-aids">Reading aids</h2>
        <div className="card stack">
          <Switch label="Bold word starts" description="Make the first letters of each word bold." checked={s.boldStarts} onChange={(v) => ext.patchSettings({ boldStarts: v })} />
          <Switch label="Focus line" description="A reading ruler that follows your mouse or text cursor." checked={s.focusLine} onChange={(v) => ext.patchSettings({ focusLine: v })} />
          <Switch label="Reduce motion" description="Turn off animations in FlowRead." checked={s.noMotion} onChange={(v) => ext.patchSettings({ noMotion: v })} />
          <Switch label="Thick focus rings" description="Heavier outlines around the focused control." checked={s.thickFocus} onChange={(v) => ext.patchSettings({ thickFocus: v })} />
        </div>
      </section>

      <section className="stack" aria-labelledby="h-pages">
        <h2 id="h-pages">On web pages</h2>
        <div className="card stack">
          <Switch label="Recolour pages" description="Use your reading colours for page backgrounds and text." checked={ext.prefs.recolor} onChange={(v) => ext.patchPrefs({ recolor: v })} />
          <Switch label="Show the on-page toolbar" description="Profile switch, focus line, read aloud, simplify and reader view." checked={ext.prefs.toolbar} onChange={(v) => ext.patchPrefs({ toolbar: v })} />
        </div>
      </section>

      <section className="stack" aria-labelledby="h-sites">
        <h2 id="h-sites">Sites where FlowRead is always on</h2>
        <p className="muted">
          Otherwise FlowRead only runs on a page when you turn it on. Each site you add asks your browser for permission to read and change that site.
        </p>
        <div className="card stack">
          <Switch label="All sites" description="Switch on automatically everywhere." checked={ext.sites.all} onChange={setAll} />
          {ext.sites.sites.length > 0 ? (
            <ul className="site-list">
              {ext.sites.sites.map((o) => (
                <li key={o}>
                  <span>{new URL(o).host}</span>
                  <button type="button" className="btn" onClick={() => removeSite(o)} aria-label={`Remove ${new URL(o).host}`}>
                    <Trash2 size={16} aria-hidden="true" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No sites yet.</p>
          )}
          <form className="site-add" onSubmit={addSite}>
            <label htmlFor="site" className="sr-only">
              Site address
            </label>
            <input id="site" value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="example.org" autoComplete="off" />
            <button type="submit" className="btn primary">
              <Plus size={16} aria-hidden="true" /> Add site
            </button>
          </form>
          <p role="status" aria-live="polite" className="muted">
            {msg}
          </p>
        </div>
      </section>

      <section className="stack" aria-labelledby="h-app">
        <h2 id="h-app">FlowRead web app</h2>
        <p className="muted">Used by the FlowRead reader for your documents. Kept in sync when the extension is installed.</p>
        <div className="card stack">
          {APP_SWITCHES.map(([key, label, desc]) => (
            <Switch key={key} label={label} description={desc} checked={!!s[key]} onChange={(v) => ext.patchSettings({ [key]: v })} />
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="h-keys">
        <h2 id="h-keys">Keyboard</h2>
        <ul>
          <li>
            <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>: turn FlowRead on or off for the current tab. Change it in your browser's extension shortcut settings.
          </li>
          <li>
            <kbd>Esc</kbd>: close reader view or the plain-language result; otherwise minimise the toolbar.
          </li>
        </ul>
      </section>

      <section className="stack" aria-labelledby="h-privacy">
        <h2 id="h-privacy">Privacy</h2>
        <p>
          FlowRead changes pages on your device. Page text is sent to the FlowRead server only when you choose <strong>Simplify selection</strong> (the
          selected text) or <strong>Open PDF in FlowRead</strong> (the PDF file). Reader view runs entirely in your browser.
        </p>
      </section>
    </main>
  );
}
