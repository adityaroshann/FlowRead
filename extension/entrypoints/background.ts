// Service worker (Chrome) / event page (Firefox).
// - toggles FlowRead per tab (activeTab + scripting.executeScript)
// - keeps "always on" sites registered as dynamic content scripts
// - PDF -> FlowRead app (fetch, convert over SSE, hand over via the bridge)
// - proxies "Simplify selection" to the API (page text leaves the device only here)
import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { CONFIG, isAppUrl } from '../src/config';
import { getSites } from '../src/lib/store';
import { isPdfUrl, originOf, originPattern } from '../src/lib/schema';
import { readSse } from '../src/lib/sse';
import type { SimplifyResult, TabState, ToBackground, ToContent } from '../src/lib/messages';

const CONTENT_FILE = '/content-scripts/flowread.js';
const AUTO_SCRIPT_ID = 'flowread-auto';
const ALL_SITES = ['http://*/*', 'https://*/*'];
const TEAL = '#0F6B6B';

// ---------- small session store (storage.session, memory fallback) ----------
const memory = new Map<string, unknown>();
const session = {
  async get<T>(key: string): Promise<T | undefined> {
    const area = browser.storage.session;
    if (!area) return memory.get(key) as T | undefined;
    try {
      return (await area.get(key))[key] as T | undefined;
    } catch {
      return memory.get(key) as T | undefined;
    }
  },
  async set(key: string, value: unknown) {
    memory.set(key, value);
    const area = browser.storage.session;
    if (!area) return;
    try {
      await area.set({ [key]: value });
    } catch {
      /* quota (large docs): the in-memory copy is used while the worker lives */
    }
  },
  async remove(key: string) {
    memory.delete(key);
    await browser.storage.session?.remove(key).catch(() => {});
  },
};

const errKey = (tabId: number) => `err:${tabId}`;
const busyKey = (tabId: number) => `busy:${tabId}`;
const onKey = (tabId: number) => `on:${tabId}`;

// ---------- badge ----------
async function badge(tabId: number, text: string, color = TEAL) {
  try {
    await browser.action.setBadgeBackgroundColor({ tabId, color });
    await browser.action.setBadgeText({ tabId, text });
    if ('setBadgeTextColor' in browser.action) await browser.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
  } catch {
    /* tab closed */
  }
}

// ---------- content script plumbing ----------
async function sendToTab<T = unknown>(tabId: number, msg: ToContent): Promise<T | null> {
  try {
    return ((await browser.tabs.sendMessage(tabId, msg)) as T) ?? null;
  } catch {
    return null; // not injected / no access
  }
}

async function contentStatus(tabId: number): Promise<{ on: boolean } | null> {
  const r = await sendToTab<{ on: boolean }>(tabId, { type: 'fr:ping' });
  return r && typeof r.on === 'boolean' ? r : null;
}

async function inject(tabId: number) {
  await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_FILE] });
}

async function setTabOn(tabId: number, on: boolean) {
  await session.set(onKey(tabId), on);
  await badge(tabId, on ? 'ON' : '');
}

async function autoOnFor(url: string | undefined): Promise<boolean> {
  const origin = originOf(url);
  if (!origin || isAppUrl(url)) return false;
  const { sites, all } = await getSites();
  if (all) return browser.permissions.contains({ origins: ALL_SITES });
  if (!sites.includes(origin)) return false;
  return browser.permissions.contains({ origins: [originPattern(origin)] });
}

async function toggle(tabId: number, want?: boolean): Promise<{ ok: boolean; on: boolean; error?: string }> {
  const cur = await contentStatus(tabId);
  const next = want ?? !(cur?.on ?? false);
  await session.remove(errKey(tabId));
  if (cur) {
    await setTabOn(tabId, next);
    await sendToTab(tabId, { type: 'fr:set', on: next });
    return { ok: true, on: next };
  }
  if (!next) {
    await setTabOn(tabId, false);
    return { ok: true, on: false };
  }
  try {
    await setTabOn(tabId, true); // the script asks for this state on load
    await inject(tabId);
    return { ok: true, on: true };
  } catch (e) {
    await setTabOn(tabId, false);
    const error = "FlowRead can't change this page. Browser pages, extension stores and built-in viewers are protected.";
    await session.set(errKey(tabId), error);
    return { ok: false, on: false, error };
  }
}

async function tabState(tabId: number): Promise<TabState> {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  const url = tab?.url ?? null;
  const origin = originOf(url ?? undefined);
  const live = await contentStatus(tabId);
  const restricted = !origin;
  return {
    tabId,
    url,
    on: live?.on ?? false,
    restricted,
    pdf: isPdfUrl(url ?? undefined),
    origin,
    autoOn: await autoOnFor(url ?? undefined),
    error: (await session.get<string>(errKey(tabId))) ?? null,
    busy: (await session.get<string>(busyKey(tabId))) ?? null,
  };
}

// ---------- always-on sites ----------
async function syncRegistrations() {
  if (!browser.scripting?.registerContentScripts) return; // very old browsers
  try {
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [AUTO_SCRIPT_ID] });
    if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT_ID] });
  } catch {
    /* nothing registered */
  }
  const { sites, all } = await getSites();
  let matches: string[] = [];
  if (all && (await browser.permissions.contains({ origins: ALL_SITES }))) matches = ALL_SITES;
  else {
    for (const site of sites) {
      if (await browser.permissions.contains({ origins: [originPattern(site)] })) matches.push(originPattern(site));
    }
  }
  if (!matches.length) return;
  await browser.scripting.registerContentScripts([
    {
      id: AUTO_SCRIPT_ID,
      matches,
      excludeMatches: CONFIG.appOrigins.map(originPattern),
      js: [CONTENT_FILE.slice(1)],
      runAt: 'document_idle',
    },
  ]);
}

// ---------- simplify ----------
async function simplify(text: string, context = ''): Promise<SimplifyResult> {
  const clean = String(text ?? '').trim().slice(0, CONFIG.simplifyMaxChars);
  if (!clean) return { ok: false, error: 'Select some text on the page first.' };
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/access/plain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, context: String(context).slice(0, 200) }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 503) return { ok: false, error: 'Plain-language rewrites are not available on the server right now.' };
    if (!res.ok) return { ok: false, error: `The FlowRead server could not rewrite this (error ${res.status}).` };
    const data = (await res.json()) as { plain?: unknown };
    if (typeof data.plain !== 'string') return { ok: false, error: 'The server sent an unexpected reply.' };
    return { ok: true, plain: data.plain };
  } catch (e) {
    const timeout = (e as Error)?.name === 'TimeoutError';
    return {
      ok: false,
      error: timeout
        ? 'The FlowRead server took too long. It may be waking up; try again in a minute.'
        : 'Could not reach the FlowRead server. Check your connection and try again.',
    };
  }
}

// ---------- PDF -> FlowRead ----------
interface Pending {
  id: string;
  doc: unknown;
  tabId: number | null;
  at: number;
}

async function failPdf(tabId: number, message: string) {
  await session.remove(busyKey(tabId));
  await session.set(errKey(tabId), message);
  await badge(tabId, '!', '#B3261E');
  // Best effort on-page notice; the popup also shows the error.
  if (!(await sendToTab(tabId, { type: 'fr:toast', message }))) {
    try {
      await inject(tabId);
      await new Promise((r) => setTimeout(r, 150));
      await sendToTab(tabId, { type: 'fr:toast', message });
    } catch {
      /* PDF viewers and protected pages cannot show it; the popup will */
    }
  }
}

const DOWNLOAD_HINT = 'Download the file, then upload it in the FlowRead app.';

async function openPdf(tabId: number, url: string) {
  if (!/^https?:/i.test(url)) {
    return failPdf(tabId, `FlowRead can only fetch PDFs from web addresses. ${DOWNLOAD_HINT}`);
  }
  await session.remove(errKey(tabId));
  await session.set(busyKey(tabId), 'Downloading PDF…');
  await badge(tabId, '…');

  let blob: Blob;
  try {
    const res = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    return failPdf(tabId, `FlowRead couldn't download this PDF (the site may block it). ${DOWNLOAD_HINT}`);
  }
  if (blob.size > CONFIG.pdfMaxBytes) return failPdf(tabId, 'This PDF is larger than 25 MB, the most FlowRead can convert.');
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') return failPdf(tabId, `That link did not return a PDF. ${DOWNLOAD_HINT}`);

  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'document.pdf') || 'document.pdf';
  const form = new FormData();
  form.append('file', new File([blob], name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`, { type: 'application/pdf' }));

  await session.set(busyKey(tabId), 'Converting…');
  await badge(tabId, '0%');
  let doc: unknown = null;
  try {
    const res = await fetch(`${CONFIG.apiBase}/api/access/convert`, { method: 'POST', body: form });
    if (res.status === 413) return failPdf(tabId, 'This PDF is too large for the FlowRead server.');
    if (!res.ok) return failPdf(tabId, `The FlowRead server could not convert this PDF (error ${res.status}).`);
    for await (const ev of readSse(res)) {
      const e = ev as { type?: string; pct?: number; message?: string; doc?: unknown };
      if (e.type === 'progress') {
        const pct = Math.max(0, Math.min(99, Math.round(Number(e.pct) || 0)));
        await badge(tabId, `${pct}%`);
        if (e.message) await session.set(busyKey(tabId), String(e.message).slice(0, 120));
      } else if (e.type === 'done') {
        doc = e.doc;
      } else if (e.type === 'error') {
        return failPdf(tabId, String(e.message || 'The PDF could not be converted.').slice(0, 300));
      }
    }
  } catch {
    return failPdf(tabId, 'Lost the connection to the FlowRead server while converting. Try again.');
  }
  if (!doc || typeof doc !== 'object') return failPdf(tabId, 'The server finished without a document. Try again.');

  const appTab = await browser.tabs.create({ url: `${CONFIG.appOrigin}/library`, openerTabId: tabId });
  const pending: Pending = { id: crypto.randomUUID(), doc, tabId: appTab.id ?? null, at: Date.now() };
  await session.set('pendingDoc', pending);
  await session.remove(busyKey(tabId));
  await badge(tabId, '');
}

async function takePending(senderTabId: number | undefined): Promise<Pending | null> {
  const p = await session.get<Pending>('pendingDoc');
  if (!p) return null;
  if (Date.now() - p.at > 30 * 60_000) {
    await session.remove('pendingDoc');
    return null;
  }
  // Deliver to the tab we opened; any app tab may claim it after a minute.
  if (p.tabId !== null && p.tabId !== senderTabId && Date.now() - p.at < 60_000) return null;
  return p;
}

// ---------- context menus ----------
const PDF_PATTERNS = ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.pdf#*', '*://*/*.PDF', '*://*/*.PDF?*'];

async function createMenus() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({ id: 'fr-pdf-link', title: 'Open PDF in FlowRead', contexts: ['link'], targetUrlPatterns: PDF_PATTERNS });
  browser.contextMenus.create({ id: 'fr-pdf-page', title: 'Open this PDF in FlowRead', contexts: ['page', 'frame'], documentUrlPatterns: PDF_PATTERNS });
  browser.contextMenus.create({ id: 'fr-toggle', title: 'Turn FlowRead on or off', contexts: ['page'] });
}

export default defineBackground({
  main() {
    browser.runtime.onInstalled.addListener(() => {
      void createMenus();
      void syncRegistrations();
    });
    browser.runtime.onStartup.addListener(() => {
      void createMenus();
      void syncRegistrations(); // Firefox does not persist dynamic content scripts
    });
    browser.permissions.onAdded.addListener(() => void syncRegistrations());
    browser.permissions.onRemoved.addListener(() => void syncRegistrations());
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.sites) void syncRegistrations();
    });

    browser.commands.onCommand.addListener((command, tab) => {
      if (command === 'toggle-flowread' && tab?.id !== undefined) void toggle(tab.id);
    });

    browser.contextMenus.onClicked.addListener((info, tab) => {
      const tabId = tab?.id;
      if (tabId === undefined) return;
      if (info.menuItemId === 'fr-toggle') return void toggle(tabId);
      const url = info.menuItemId === 'fr-pdf-link' ? info.linkUrl : info.frameUrl || info.pageUrl;
      if (!url) return;
      // activeTab covers the tab's own origin. A PDF link to another site needs
      // that origin too; ask now, while the click still counts as a user gesture.
      const target = originOf(url);
      if (target && target !== originOf(tab?.url)) {
        browser.permissions
          .request({ origins: [originPattern(target)] })
          .catch(() => false)
          .finally(() => void openPdf(tabId, url));
        return;
      }
      void openPdf(tabId, url);
    });

    browser.tabs.onUpdated.addListener((tabId, info) => {
      if (info.status === 'loading' && info.url) {
        void session.remove(onKey(tabId));
        void session.remove(errKey(tabId));
        void badge(tabId, '');
      } else if (info.status === 'complete') {
        void contentStatus(tabId).then((s) => s && badge(tabId, s.on ? 'ON' : ''));
      }
    });
    browser.tabs.onRemoved.addListener((tabId) => {
      void session.remove(onKey(tabId));
      void session.remove(errKey(tabId));
      void session.remove(busyKey(tabId));
    });

    browser.runtime.onMessage.addListener((raw: unknown, sender: Browser.runtime.MessageSender) => {
      if (sender.id !== browser.runtime.id) return undefined;
      const msg = raw as ToBackground;
      const senderTab = sender.tab?.id;
      switch (msg?.type) {
        case 'fr:hello':
          return (async () => {
            if (senderTab === undefined) return { on: false };
            const stored = await session.get<boolean>(onKey(senderTab));
            const on = stored ?? (await autoOnFor(sender.tab?.url));
            await badge(senderTab, on ? 'ON' : '');
            return { on };
          })();
        case 'fr:report':
          if (senderTab !== undefined) return setTabOn(senderTab, !!msg.on).then(() => ({ ok: true }));
          return undefined;
        case 'fr:state':
          return tabState(msg.tabId);
        case 'fr:toggle':
          return toggle(msg.tabId, msg.on);
        case 'fr:openPdf':
          return (async () => {
            const tab = await browser.tabs.get(msg.tabId);
            const url = msg.url ?? tab.url;
            if (!url) return { ok: false };
            void openPdf(msg.tabId, url);
            return { ok: true };
          })();
        case 'fr:simplify':
          return simplify(msg.text, msg.context);
        case 'fr:syncSites':
          return syncRegistrations().then(() => ({ ok: true }));
        case 'fr:bridge:pending':
          if (!isAppUrl(sender.url)) return Promise.resolve(null);
          return takePending(senderTab);
        case 'fr:bridge:delivered':
          if (!isAppUrl(sender.url)) return undefined;
          return session.get<Pending>('pendingDoc').then(async (p) => {
            if (p && p.id === msg.id) await session.remove('pendingDoc');
            return { ok: true };
          });
        default:
          return undefined;
      }
    });

    if (import.meta.env.MODE === 'e2e') {
      // Test hook for Playwright: drive the same code paths as the popup.
      (globalThis as any).flowreadTest = { toggle, tabState, syncRegistrations, openPdf };
    }
  },
});
