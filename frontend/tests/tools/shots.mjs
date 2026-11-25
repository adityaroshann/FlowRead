// Screenshot helper for visual review (not a test).
// node tests/tools/shots.mjs <outDir> [base=http://localhost:5173] [only=comma,separated,names]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] || 'shots';
const base = process.argv[3] || 'http://localhost:5173';
const only = (process.argv[4] || '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });

const prefs = (profileId, patch = {}) => ({ profileId, settings: { ...patch }, reduceMotion: false });

const shots = [
  { name: 'home-desktop', path: '/', w: 1440, h: 1000 },
  { name: 'home-mobile', path: '/', w: 390, h: 844, full: true },
  { name: 'home-dark', path: '/', w: 1440, h: 1000, prefs: prefs('standard', { theme: 'dark', font: 'atkinson' }) },
  { name: 'library', path: '/library', w: 1280, h: 860, seed: true },
  { name: 'reader-standard', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('standard', { font: 'atkinson' }) },
  { name: 'reader-dyslexia', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('dyslexia', { theme: 'cream', font: 'atkinson', letterSpacing: 0.12, wordSpacing: 0.16, lineHeight: 1.8, measure: 65, textScale: 1.1 }) },
  { name: 'reader-dark-bold', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('standard', { theme: 'dark', font: 'lexend', boldStarts: true }) },
  { name: 'reader-hc', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('lowvision', { theme: 'high-contrast', font: 'atkinson', textScale: 1.5, measure: 60, thickFocus: true }) },
  { name: 'reader-focus', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('focus', { focusMode: true, summaries: true, font: 'atkinson', lineHeight: 1.7, measure: 65 }) },
  { name: 'reader-mobile', path: '/read/doc_sample', w: 390, h: 844, prefs: prefs('standard', { font: 'atkinson' }) },
  { name: 'reader-adjust', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('standard', { font: 'atkinson' }), act: 'adjust' },
  { name: 'reader-palette', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('standard', { font: 'atkinson' }), act: 'palette' },
  { name: 'reader-download', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('standard', { font: 'atkinson' }), act: 'download' },
  { name: 'reader-selection', path: '/read/doc_sample', w: 1440, h: 960, prefs: prefs('standard', { font: 'atkinson' }), act: 'select' },
  { name: 'edit', path: '/read/doc_sample/edit', w: 1440, h: 960, seed: true },
  { name: 'workspace', path: '/workspace', w: 1440, h: 960 },
];

const browser = await chromium.launch();
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${s.name}] pageerror:`, e.message));
  await page.addInitScript((p) => {
    if (p) {
      const full = { ...p, settings: { theme: 'light', font: 'atkinson', textScale: 1, letterSpacing: 0, wordSpacing: 0, lineHeight: 1.6, measure: 70, boldStarts: false, readAloud: true, plainLanguage: true, focusMode: false, summaries: false, focusLine: false, noMotion: false, minimalChrome: false, thickFocus: false, imageDetails: true, mathSpoken: false, announceSections: false, ...p.settings } };
      localStorage.setItem('flowread-access:reader-prefs', JSON.stringify(full));
    }
  }, s.prefs || null);
  if (s.seed) {
    await page.goto(base + '/read/doc_sample');
    await page.waitForSelector('h1');
  }
  await page.goto(base + s.path);
  await page.waitForSelector('h1', { timeout: 15000 });
  await page.waitForTimeout(600);
  if (s.act === 'adjust') {
    await page.getByRole('tab', { name: 'Adjust' }).click();
  } else if (s.act === 'palette') {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.cmd');
  } else if (s.act === 'download') {
    await page.getByRole('button', { name: /download/i }).first().click();
    await page.waitForSelector('.dl');
  } else if (s.act === 'select') {
    await page.evaluate(() => {
      const p = document.querySelector('#blk-b2');
      const r = document.createRange();
      const t = p.querySelector('span')?.firstChild || p.firstChild;
      r.setStart(p.firstChild.firstChild || p.firstChild, 0);
      r.setEnd(p.lastChild.lastChild || p.lastChild, 0);
      const sel = window.getSelection();
      sel.removeAllRanges();
      const rr = document.createRange();
      rr.selectNodeContents(p);
      sel.addRange(rr);
      void t;
    });
    await page.mouse.up();
    await page.dispatchEvent('#blk-b2', 'pointerup');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${s.name}.png`), fullPage: !!s.full });
  console.log('shot', s.name);
  await ctx.close();
}
await browser.close();
