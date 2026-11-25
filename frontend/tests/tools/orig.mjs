// node tests/tools/orig.mjs <pdf> <out.png> : side-by-side original view check.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [pdf, out] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/read/doc_sample');
await page.waitForSelector('h1');
const b64 = readFileSync(pdf).toString('base64');
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  await new Promise((res, rej) => {
    const r = indexedDB.open('flowread');
    r.onsuccess = () => { const tx = r.result.transaction('docs', 'readwrite'); tx.objectStore('docs').put(blob, 'src:doc_sample'); tx.oncomplete = res; tx.onerror = rej; };
  });
}, b64);
await page.reload();
await page.getByRole('button', { name: 'Original' }).click();
await page.waitForTimeout(2500);
await page.getByRole('heading', { name: 'The plasma membrane' }).scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 200));
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
