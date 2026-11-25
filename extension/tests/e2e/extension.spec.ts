// End-to-end: load the built extension (.output/chrome-mv3-e2e) into Chromium
// and drive it through the background's test hook (same code path as the
// popup and the Alt+Shift+F command).
import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsForProfile } from '../../../packages/core/src/profiles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, '../../.output/chrome-mv3-e2e');
const FIX = path.resolve(here, '../fixtures');

function serve(host: string, port: number, handler: http.RequestListener) {
  return new Promise<http.Server>((resolve, reject) => {
    const s = http.createServer(handler);
    s.once('error', reject);
    s.listen(port, host, () => resolve(s));
  });
}

const portFree = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, host, () => s.close(() => resolve(true)));
  });

const staticHandler: http.RequestListener = (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/sample.pdf') {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    res.end('%PDF-1.4\n% test file\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
    return;
  }
  const file = path.join(FIX, path.basename(url.pathname) || 'article.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(file));
};

type Fixtures = { context: BrowserContext; sw: Worker; site: string };

const test = base.extend<Fixtures>({
  site: async ({}, use) => {
    const server = await serve('127.0.0.1', 0, staticHandler);
    const { port } = server.address() as net.AddressInfo;
    await use(`http://127.0.0.1:${port}`);
    server.close();
  },
  context: async ({}, use) => {
    if (!fs.existsSync(path.join(EXT, 'manifest.json'))) throw new Error('Run `npm run build:e2e` first.');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
});

async function tabIdFor(sw: Worker, url: string): Promise<number> {
  return sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url === u);
    if (!t?.id) throw new Error(`no tab for ${u}`);
    return t.id;
  }, url);
}

const toggle = (sw: Worker, tabId: number, on?: boolean) =>
  sw.evaluate(([id, want]) => (globalThis as any).flowreadTest.toggle(id, want), [tabId, on] as const);

async function idle(page: Page) {
  await page.evaluate(async () => {
    delete document.documentElement.dataset.flowreadIdle;
    window.dispatchEvent(new Event('flowread-test-idle'));
  });
  await page.waitForFunction(() => document.documentElement.dataset.flowreadIdle !== undefined, null, { timeout: 15_000 });
  return Number(await page.evaluate(() => document.documentElement.dataset.flowreadIdle));
}

async function setSettings(sw: Worker, settings: object, profileId = 'dyslexia') {
  await sw.evaluate(([s, p]) => chrome.storage.sync.set({ settings: s, profileId: p }), [settings, profileId] as const);
}

test('toggle on styles the page, skips protected content, and off restores the DOM exactly', async ({ context, sw, site }) => {
  await setSettings(sw, { ...settingsForProfile('dyslexia'), boldStarts: true });
  const page = await context.newPage();
  const url = `${site}/article.html`;
  await page.goto(url);
  const original = await page.evaluate(() => document.body.innerHTML);
  const tabId = await tabIdFor(sw, url);

  expect(await toggle(sw, tabId)).toMatchObject({ ok: true, on: true });
  await page.waitForSelector('html.flowread-on');
  await page.waitForFunction(() => document.documentElement.dataset.flowreadReady === '1');
  const count = await idle(page);
  expect(count).toBeGreaterThan(40);

  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const p = document.querySelector('article p:not(.byline)')!;
    const cs = getComputedStyle(p);
    const inside = (sel: string) => document.querySelectorAll(`${sel} b.fr-b`).length;
    return {
      styles: document.querySelectorAll('style#flowread-style').length,
      font: cs.fontFamily,
      letterSpacing: cs.letterSpacing,
      bg: getComputedStyle(document.body).backgroundColor,
      fontLoaded: document.fonts.check('16px "Atkinson Hyperlegible Next"'),
      protectedBold: ['pre', 'code', 'kbd', 'samp', 'textarea', 'select', '[contenteditable]', 'svg', '[aria-hidden="true"]', 'script', 'input'].map(inside),
      headingBold: inside('h1'),
      hebrewBold: inside('p[dir="rtl"]'),
      inputValue: (document.getElementById('name') as HTMLInputElement).value,
      textarea: (document.getElementById('msg') as HTMLTextAreaElement).value,
      h1Text: document.querySelector('h1')!.textContent,
    };
  });
  expect(result.styles).toBe(1);
  expect(result.font).toContain('Atkinson Hyperlegible Next');
  expect(parseFloat(result.letterSpacing)).toBeGreaterThan(1);
  expect(result.bg).toBe('rgb(244, 236, 216)'); // cream theme
  expect(result.fontLoaded).toBe(true);
  expect(result.protectedBold.every((n) => n === 0)).toBe(true);
  expect(result.headingBold).toBe(4);
  expect(result.hebrewBold).toBe(3);
  expect(result.inputValue).toBe('Sam');
  expect(result.textarea).toBe('Great article about valleys');
  expect(result.h1Text).toBe('How Rivers Carve Valleys');

  // Shadow-DOM toolbar is present and labelled.
  const bar = page.getByRole('region', { name: 'FlowRead reading tools' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Bold word starts' })).toHaveAttribute('aria-pressed', 'true');

  // Live settings change, no reload.
  await setSettings(sw, { ...settingsForProfile('lowvision'), boldStarts: true }, 'lowvision');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');

  // Off: exact restoration.
  expect(await toggle(sw, tabId)).toMatchObject({ ok: true, on: false });
  expect(await page.evaluate(() => document.body.innerHTML)).toBe(original);
  expect(await page.evaluate(() => [!!document.getElementById('flowread-style'), document.documentElement.className])).toEqual([false, '']);
  expect(await page.evaluate(() => (window as any).__pageScriptRan)).toBe(true);
});

test('SPA content added later gets bold word starts; restoration still exact', async ({ context, sw, site }) => {
  await setSettings(sw, { ...settingsForProfile('standard'), boldStarts: true }, 'standard');
  const page = await context.newPage();
  const url = `${site}/article.html`;
  await page.goto(url);
  const original = await page.evaluate(() => document.body.innerHTML);
  const tabId = await tabIdFor(sw, url);
  await toggle(sw, tabId, true);
  await page.waitForSelector('html.flowread-on');
  await page.waitForFunction(() => document.documentElement.dataset.flowreadReady === '1');
  await idle(page);

  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'late';
    p.textContent = 'Loaded after the first pass';
    document.querySelector('article')!.append(p);
  });
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#late b.fr-b').length)).toBe(5);

  await toggle(sw, tabId, false);
  await page.evaluate(() => document.getElementById('late')!.remove());
  expect(await page.evaluate(() => document.body.innerHTML)).toBe(original);
});

test('toolbar: reader view opens as a dialog, traps focus, closes with Escape', async ({ context, sw, site }) => {
  await setSettings(sw, { ...settingsForProfile('standard'), boldStarts: true }, 'standard');
  const page = await context.newPage();
  const url = `${site}/article.html`;
  await page.goto(url);
  const tabId = await tabIdFor(sw, url);
  await toggle(sw, tabId, true);
  const readerBtn = page.getByRole('button', { name: 'Reader view' });
  await readerBtn.click();
  const dialog = page.getByRole('dialog', { name: 'How Rivers Carve Valleys' });
  await expect(dialog).toBeVisible();
  // the article text is there, with bold word starts, and comments/aside are not
  await expect(dialog).toContainText('A river does three jobs at once');
  expect(await dialog.locator('b.fr-b').count()).toBeGreaterThan(20);
  await expect(dialog).not.toContainText('Advertisement placeholder');
  await expect(dialog.getByRole('button', { name: 'Close reader view' })).toBeFocused();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/reader-view.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(readerBtn).toBeFocused();

  // Turning off from the toolbar removes everything.
  await page.getByRole('button', { name: 'Turn FlowRead off on this page' }).click();
  await expect(page.locator('flowread-ui')).toHaveCount(0);
  await expect(page.locator('html.flowread-on')).toHaveCount(0);
});

test('protected pages report an error instead of failing silently', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  await page.bringToFront();
  // No `tabs` permission, so chrome:// URLs are hidden: use the active tab.
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!);
  const r = await toggle(sw, tabId, true);
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/can't change this page/);
});

test('bridge + PDF hand-off: convert via API (mocked), open the app, deliver openDoc', async ({ context, sw, site }) => {
  test.skip(!(await portFree(5173, 'localhost')) || !(await portFree(8000, 'localhost')), 'ports 5173/8000 in use');
  const app = await serve('localhost', 5173, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(FIX, 'app.html')));
  });
  let uploaded = 0;
  const api = await serve('localhost', 8000, (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.url === '/api/access/plain') {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ plain: `<b>Simple:</b> ${body.text}` }));
        return;
      }
      uploaded = Buffer.concat(chunks).length;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
      res.write('data: {"type":"progress","step":"layout","message":"Reading page layout","pct":20}\n\n');
      res.write('data: {"type":"progress","step":"check","message":"Checking","pct":90}\n\n');
      res.end('data: {"type":"done","doc":{"id":"doc-1","title":"Sample","sections":[]}}\n\n');
    });
  });
  try {
    await setSettings(sw, { ...settingsForProfile('dyslexia') }, 'dyslexia');
    const page = await context.newPage();
    const pdfUrl = `${site}/sample.pdf`;
    await page.goto(`${site}/article.html`);
    const tabId = await tabIdFor(sw, `${site}/article.html`);
    const appPage = context.waitForEvent('page');
    await sw.evaluate(([id, u]) => (globalThis as any).flowreadTest.openPdf(id, u), [tabId, pdfUrl] as const);
    const ap = await appPage;
    await ap.waitForLoadState();
    await expect.poll(() => ap.evaluate(() => (window as any).__msgs.map((m: any) => m.type)), { timeout: 15_000 }).toEqual(
      expect.arrayContaining(['ready', 'settings', 'openDoc']),
    );
    const msgs = await ap.evaluate(() => (window as any).__msgs);
    expect(msgs.find((m: any) => m.type === 'openDoc').doc.id).toBe('doc-1');
    expect(msgs.find((m: any) => m.type === 'settings').settings.theme).toBe('cream');
    expect(msgs.find((m: any) => m.type === 'ready').version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(uploaded).toBeGreaterThan(50);

    // Simplify selection: text goes to the API via the background; the reply is shown as text, never HTML.
    await page.bringToFront();
    await toggle(sw, tabId, true);
    await page.evaluate(() => {
      const p = document.querySelectorAll('article p')[2]!;
      const r = document.createRange();
      r.selectNodeContents(p);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(r);
    });
    await page.getByRole('button', { name: 'Simplify selection' }).click();
    const pop = page.getByRole('dialog', { name: 'In plain language' });
    await expect(pop).toContainText('<b>Simple:</b> A river does three jobs at once.');
    expect(await pop.locator('b').count()).toBe(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/toolbar-simplify.png' });

    // Pending doc is cleared once delivered.
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.session.get('pendingDoc')).pendingDoc ?? null)).toBeNull();

    // Page -> extension: setSettings is validated and stored; junk is ignored.
    await ap.evaluate(() => {
      window.postMessage({ source: 'flowread-app', type: 'setSettings', settings: { theme: 'dark', textScale: 9, evil: '<img>' } }, location.origin);
      window.postMessage({ source: 'flowread-app', type: 'runScript', code: 'alert(1)' }, location.origin);
      window.postMessage({ source: 'someone-else', type: 'setSettings', settings: { theme: 'light' } }, location.origin);
    });
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings.theme)).toBe('dark');
    const stored = await sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings);
    expect(stored.textScale).toBe(2); // clamped
    expect('evil' in stored).toBe(false);
  } finally {
    app.close();
    api.close();
  }
});
