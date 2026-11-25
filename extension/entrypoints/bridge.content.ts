// Bridge between the FlowRead web app and the extension (docs/v2/CONTRACT.md,
// "Extension <-> web app protocol"). Runs only on the app origins.
//
// Page -> extension: { source: 'flowread-app', type: 'hello' | 'getSettings' | 'setSettings', settings? }
// Extension -> page: { source: 'flowread-ext', type: 'ready' | 'settings' | 'openDoc', settings?, doc? }
//
// Only those three page messages are accepted. The page can read and write the
// shared reading settings and receive documents the extension converted; it
// cannot make the extension do anything else.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSynced, KEYS } from '../src/lib/store';
import { sanitizeProfileId, sanitizeSettings } from '../src/lib/schema';
import type { ToBackground } from '../src/lib/messages';

const PAGE_TYPES = new Set(['hello', 'getSettings', 'setSettings']);

export default defineContentScript({
  matches: ['http://localhost:5173/*', 'https://flowread-mu.vercel.app/*'],
  runAt: 'document_start',
  main(ctx) {
    const version = browser.runtime.getManifest().version;
    const origin = window.location.origin;
    const post = (msg: Record<string, unknown>) => window.postMessage({ source: 'flowread-ext', ...msg }, origin);
    const send = (msg: ToBackground) => browser.runtime.sendMessage(msg);
    let lastFromPage = '';

    async function sendSettings() {
      const { settings } = await getSynced();
      post({ type: 'settings', settings });
    }

    async function deliverPending() {
      try {
        const p = (await send({ type: 'fr:bridge:pending' })) as { id: string; doc: unknown } | null;
        if (!p?.doc) return;
        post({ type: 'openDoc', doc: p.doc });
        await send({ type: 'fr:bridge:delivered', id: p.id });
      } catch {
        /* extension reloaded */
      }
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== origin) return;
      const data = event.data as { source?: unknown; type?: unknown; settings?: unknown; profileId?: unknown } | null;
      if (!data || typeof data !== 'object' || data.source !== 'flowread-app') return;
      if (typeof data.type !== 'string' || !PAGE_TYPES.has(data.type)) return;

      if (data.type === 'hello') {
        post({ type: 'ready', version });
        void sendSettings();
        void deliverPending(); // the page is listening now
      } else if (data.type === 'getSettings') {
        void sendSettings();
      } else if (data.type === 'setSettings') {
        if (!data.settings || typeof data.settings !== 'object') return;
        void (async () => {
          const cur = await getSynced();
          const settings = sanitizeSettings(data.settings, cur.settings);
          lastFromPage = JSON.stringify(settings);
          const update: Record<string, unknown> = { [KEYS.settings]: settings };
          // Optional extra: the page may say which profile these came from.
          const pid = sanitizeProfileId(data.profileId);
          if (pid) update[KEYS.profileId] = pid;
          await browser.storage.sync.set(update);
        })();
      }
    };
    window.addEventListener('message', onMessage);

    // Changes made in the popup or on another tab reach the open app too.
    const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'sync' || !changes[KEYS.settings]) return;
      const settings = sanitizeSettings(changes[KEYS.settings]?.newValue);
      if (JSON.stringify(settings) === lastFromPage) return; // echo of the page's own change
      post({ type: 'settings', settings });
    };
    browser.storage.onChanged.addListener(onStorage);

    // Announce ourselves in case the page said hello before we were listening.
    const announce = () => post({ type: 'ready', version });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce, { once: true });
    else announce();

    ctx.onInvalidated(() => {
      window.removeEventListener('message', onMessage);
      browser.storage.onChanged.removeListener(onStorage);
    });
  },
});
