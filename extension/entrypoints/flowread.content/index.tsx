// Injected on demand (scripting.executeScript from the toolbar button, the
// Alt+Shift+F command or the context menu) and, for "always on" sites, by a
// dynamically registered content script. Running twice in one page is a no-op.
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { readingCss, settingsForProfile, type Settings } from '@flowread/core';
import { createTransformer, UI_ATTR } from '../../src/lib/transform';
import { fontFaceCss } from '../../src/lib/fonts';
import { getPrefs, getSynced, KEYS, setPrefs, setSettings } from '../../src/lib/store';
import { sanitizePrefs, sanitizeProfileId, sanitizeSettings } from '../../src/lib/schema';
import type { ToBackground, ToContent } from '../../src/lib/messages';
import { createStore, type PageActions, type PageState } from './state';
import { App } from './App';
import uiCss from './ui.css?inline';

declare global {
  interface Window {
    __flowreadLoaded?: boolean;
  }
}

const send = (msg: ToBackground) => browser.runtime.sendMessage(msg);

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  async main(ctx) {
    if (window.__flowreadLoaded) return;
    window.__flowreadLoaded = true;
    await run(ctx);
  },
});

async function run(ctx: ContentScriptContext) {
  const transformer = createTransformer(document);
  const synced = await getSynced();
  const store = createStore<PageState>({
    on: false,
    settings: synced.settings,
    profileId: synced.profileId,
    prefs: await getPrefs(),
    toast: null,
  });

  const fontCss = fontFaceCss((p) => browser.runtime.getURL(p as any));
  const pageCss = (s: Settings) => `${fontCss}\n${readingCss(s, { scope: 'html.flowread-on', recolor: store.get().prefs.recolor })}`;

  // ---- shadow UI (mounted only while on, or to show a notice) ----
  let ui: ShadowRootContentScriptUi<ReactDOM.Root> | null = null;
  let uiBusy: Promise<void> | null = null;

  async function ensureUi() {
    if (ui || uiBusy) return uiBusy ?? undefined;
    uiBusy = (async () => {
      const created = await createShadowRootUi(ctx, {
        name: 'flowread-ui',
        position: 'inline',
        anchor: 'body',
        append: 'last',
        css: uiCss,
        isolateEvents: ['keydown', 'keyup', 'keypress'],
        onMount(container, _shadow, host) {
          host.setAttribute(UI_ATTR, '');
          host.setAttribute('data-flowread-skip', '');
          const el = document.createElement('div');
          el.className = 'fr-mount';
          container.append(el);
          const root = ReactDOM.createRoot(el);
          root.render(<App store={store} actions={actions} />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      created.mount();
      ui = created;
    })();
    await uiBusy;
    uiBusy = null;
  }

  function removeUi() {
    ui?.remove();
    ui = null;
  }

  function syncUi() {
    const s = store.get();
    const want = (s.on && s.prefs.toolbar) || !!s.toast;
    if (want) void ensureUi();
    else if (ui) removeUi();
  }

  // ---- on / off ----
  function setOn(on: boolean) {
    const { settings } = store.get();
    if (on) transformer.enable({ css: pageCss(settings), boldStarts: settings.boldStarts });
    else {
      // Remove the UI first so the page DOM matches what it was before.
      store.set({ on: false });
      syncUi();
      transformer.disable();
    }
    store.set({ on });
    syncUi();
  }

  function reapply() {
    if (!transformer.on) return;
    const { settings } = store.get();
    transformer.update({ css: pageCss(settings), boldStarts: settings.boldStarts });
  }

  const actions: PageActions = {
    setProfile(id) {
      const settings = settingsForProfile(id);
      store.set({ settings, profileId: id });
      reapply();
      void browser.storage.sync.set({ [KEYS.settings]: settings, [KEYS.profileId]: id });
    },
    patchSettings(patch) {
      const settings = sanitizeSettings(patch, store.get().settings);
      store.set({ settings });
      reapply();
      void setSettings(settings);
    },
    patchPrefs(patch) {
      store.set({ prefs: sanitizePrefs({ ...store.get().prefs, ...patch }) });
      reapply();
      syncUi();
      void setPrefs(patch);
    },
    turnOff() {
      setOn(false);
      void send({ type: 'fr:report', on: false });
    },
    async simplify(text) {
      return (await send({ type: 'fr:simplify', text, context: document.title })) as Awaited<ReturnType<PageActions['simplify']>>;
    },
    dismissToast() {
      store.set({ toast: null });
      syncUi();
    },
  };

  // ---- messages from the background ----
  browser.runtime.onMessage.addListener((raw: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    const msg = raw as ToContent;
    if (msg?.type === 'fr:ping') return Promise.resolve({ on: store.get().on });
    if (msg?.type === 'fr:set') {
      setOn(!!msg.on);
      return Promise.resolve({ on: store.get().on });
    }
    if (msg?.type === 'fr:toast') {
      store.set({ toast: String(msg.message).slice(0, 400) });
      syncUi();
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });

  // ---- live settings from the popup, options page, other tabs or the web app ----
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes[KEYS.settings] || changes[KEYS.profileId])) {
      const patch: Partial<PageState> = {};
      if (changes[KEYS.settings]) patch.settings = sanitizeSettings(changes[KEYS.settings]?.newValue);
      if (changes[KEYS.profileId]) patch.profileId = sanitizeProfileId(changes[KEYS.profileId]?.newValue) ?? 'standard';
      store.set(patch);
      reapply();
    }
    if (area === 'local' && changes[KEYS.prefs]) {
      store.set({ prefs: sanitizePrefs(changes[KEYS.prefs]?.newValue) });
      reapply();
      syncUi();
    }
  });

  ctx.onInvalidated(() => {
    // Extension updated or reloaded: leave the page exactly as we found it.
    removeUi();
    transformer.disable();
  });

  // ---- initial state from the background (per-tab toggle or always-on site) ----
  try {
    const r = (await send({ type: 'fr:hello' })) as { on?: boolean } | undefined;
    if (r?.on) setOn(true);
  } catch {
    /* background unavailable */
  }

  if (import.meta.env.MODE === 'e2e') {
    // Lets Playwright wait for idle work in the isolated world via the page.
    document.documentElement.dataset.flowreadReady = '1';
    window.addEventListener('flowread-test-idle', () => {
      void transformer.whenIdle().then(() => {
        document.documentElement.dataset.flowreadIdle = String(transformer.count());
      });
    });
  }
}
