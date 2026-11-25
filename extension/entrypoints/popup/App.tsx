import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, ExternalLink, FileText, Settings2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { CONFIG } from '../../src/config';
import { KEYS, isCustomised } from '../../src/lib/store';
import { originPattern, sanitizeSites } from '../../src/lib/schema';
import type { TabState } from '../../src/lib/messages';
import { BoldStrength, ProfilePicker, Slider, Switch, em, pct, times } from '../../src/ui/controls';
import { useExtensionState } from '../../src/ui/useExtensionState';

async function activeTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

export function App() {
  const ext = useExtensionState();
  const [tab, setTab] = useState<TabState | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  // Firefox treats host_permissions as optional; the API and app bridge need them.
  const [servicesGranted, setServicesGranted] = useState(true);
  const SERVICES = [`${CONFIG.apiBase}/*`, ...CONFIG.appOrigins.map((o) => `${o}/*`)];
  useEffect(() => {
    void browser.permissions.contains({ origins: SERVICES }).then(setServicesGranted);
  }, []);

  const refresh = useCallback(async () => {
    const id = await activeTabId();
    if (id === null) return;
    setTab((await browser.runtime.sendMessage({ type: 'fr:state', tabId: id })) as TabState);
  }, []);

  useEffect(() => {
    void refresh();
    // PDF conversion progress lives in the background; poll while open.
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  const toggle = async (on: boolean) => {
    if (!tab) return;
    setWorking(true);
    setError('');
    const r = (await browser.runtime.sendMessage({ type: 'fr:toggle', tabId: tab.tabId, on })) as { ok: boolean; error?: string };
    if (!r.ok && r.error) setError(r.error);
    setWorking(false);
    void refresh();
  };

  // Must call permissions.request synchronously inside the click handler.
  const setAlwaysOn = (want: boolean) => {
    if (!tab?.origin) return;
    const origin = tab.origin;
    const list = sanitizeSites({ ...ext.sites, sites: want ? [...ext.sites.sites, origin] : ext.sites.sites.filter((s) => s !== origin) });
    void browser.storage.local.set({ [KEYS.sites]: list });
    ext.setSitesLocal(list);
    if (!want) {
      void browser.permissions.remove({ origins: [originPattern(origin)] }).catch(() => {});
      void refresh();
      return;
    }
    browser.permissions
      .request({ origins: [originPattern(origin)] })
      .then(async (granted) => {
        if (!granted) {
          const back = sanitizeSites({ ...list, sites: list.sites.filter((s) => s !== origin) });
          await browser.storage.local.set({ [KEYS.sites]: back });
          ext.setSitesLocal(back);
          setError('FlowRead needs permission for this site to switch on by itself.');
          return;
        }
        await browser.runtime.sendMessage({ type: 'fr:syncSites' });
        if (!tab.on) await toggle(true);
        void refresh();
      })
      .catch(() => setError('The browser did not allow the permission request.'));
  };

  const openPdf = async () => {
    if (!tab) return;
    setError('');
    await browser.runtime.sendMessage({ type: 'fr:openPdf', tabId: tab.tabId });
    void refresh();
  };

  const s = ext.synced?.settings;
  const customised = ext.synced ? isCustomised(ext.synced.settings, ext.synced.profileId) : false;
  const err = error || tab?.error;

  return (
    <main className="popup stack">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          <BookOpenText size={18} />
        </span>
        <h1>FlowRead</h1>
        <a className="btn link push" href={`${CONFIG.appOrigin}/`} target="_blank" rel="noopener noreferrer">
          Open app <ExternalLink size={14} aria-hidden="true" />
        </a>
      </header>

      {!servicesGranted && (
        <div className="notice stack">
          <span>FlowRead needs access to its own server and web app for Simplify, PDFs and settings sync.</span>
          <button
            type="button"
            className="btn"
            onClick={() => void browser.permissions.request({ origins: SERVICES }).then(setServicesGranted)}
          >
            Allow FlowRead services
          </button>
        </div>
      )}

      <section className="card stack" aria-label="This page">
        <Switch
          big
          label={tab?.on ? 'On for this page' : 'Off for this page'}
          description={tab?.restricted ? 'FlowRead cannot run on this kind of page.' : 'Shortcut: Alt+Shift+F'}
          checked={!!tab?.on}
          disabled={!tab || tab.restricted || working}
          onChange={toggle}
        />
        {tab?.origin && !tab.restricted && (
          <Switch
            label="Always on for this site"
            description={new URL(tab.origin).host}
            checked={ext.sites.all || ext.sites.sites.includes(tab.origin)}
            disabled={ext.sites.all}
            onChange={setAlwaysOn}
          />
        )}
        {tab?.pdf && (
          <button type="button" className="btn primary" onClick={openPdf} disabled={!!tab.busy}>
            <FileText size={18} aria-hidden="true" /> Open this PDF in FlowRead
          </button>
        )}
        <div role="status" aria-live="polite">
          {tab?.busy && <p className="notice">{tab.busy}</p>}
          {err && <p className="notice error">{err}</p>}
        </div>
      </section>

      {ext.synced && s && (
        <>
          <ProfilePicker compact value={ext.synced.profileId} onChange={ext.chooseProfile} />
          {customised && <p className="muted small">Your adjustments are applied on top of this profile.</p>}
          <section className="stack" aria-label="Quick adjustments">
            <Switch label="Bold word starts" checked={s.boldStarts} onChange={(v) => ext.patchSettings({ boldStarts: v })} />
            {s.boldStarts && <BoldStrength value={s.boldIntensity} onChange={(v) => ext.patchSettings({ boldIntensity: v })} />}
            <Slider label="Text size" value={s.textScale} min={0.8} max={2} step={0.1} format={pct} onChange={(v) => ext.patchSettings({ textScale: v })} />
            <Slider label="Letter spacing" value={s.letterSpacing} min={0} max={0.35} step={0.01} format={em} onChange={(v) => ext.patchSettings({ letterSpacing: v })} />
            <Slider label="Line spacing" value={s.lineHeight} min={1.2} max={2.4} step={0.1} format={times} onChange={(v) => ext.patchSettings({ lineHeight: v })} />
          </section>
        </>
      )}

      <footer className="popup-foot">
        <button type="button" className="btn" onClick={() => browser.runtime.openOptionsPage()}>
          <Settings2 size={16} aria-hidden="true" /> All settings
        </button>
      </footer>
    </main>
  );
}
