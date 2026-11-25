// Ad-hoc debugging helper (not a test).
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.route('**/api/**', (r) => r.fulfill({ status: 503, body: '{}' }));
await page.goto('http://localhost:5173/');
await page.waitForSelector('h1');
await page.goto('http://localhost:5173/read/doc_sample');
await page.waitForSelector('h1');
await page.evaluate(() => window.postMessage({ source: 'flowread-ext', type: 'ready', version: '0.1.0' }, '*'));
await page.waitForTimeout(200);
await page.evaluate(() => window.postMessage({ source: 'flowread-ext', type: 'settings', settings: { theme: 'dark', font: 'lexend' } }, '*'));
await page.waitForTimeout(500);
console.log('theme after ext settings:', await page.evaluate(() => document.documentElement.dataset.uiTheme), await page.evaluate(() => localStorage.getItem('flowread-access:reader-prefs')));

await page.evaluate(() => {
  const f = document.createElement('iframe');
  document.body.appendChild(f);
  f.contentWindow.eval("parent.postMessage({ source: 'flowread-ext', type: 'settings', settings: { theme: 'cream' } }, '*')");
});
await page.waitForTimeout(500);
console.log('theme after iframe:', await page.evaluate(() => document.documentElement.dataset.uiTheme), page.url());
await page.keyboard.press('Control+k');
await page.keyboard.type('dyslexia');
await page.waitForTimeout(300);
console.log(await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map((e) => `${e.textContent} focused=${e.hasAttribute('data-focused')}`).join('\n')));
await browser.close();
