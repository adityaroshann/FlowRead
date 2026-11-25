import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

export const PROFILES = ['standard', 'dyslexia', 'focus', 'screenreader', 'lowvision'];

// Mirrors PROFILES in packages/core/src/profiles.js (with the web app's
// Atkinson default for profiles whose preset font is "system").
const BASE = {
  theme: 'light',
  font: 'atkinson',
  textScale: 1,
  letterSpacing: 0,
  wordSpacing: 0,
  lineHeight: 1.6,
  measure: 70,
  boldStarts: false,
  readAloud: true,
  plainLanguage: true,
  focusMode: false,
  summaries: false,
  focusLine: false,
  noMotion: false,
  minimalChrome: false,
  thickFocus: false,
  imageDetails: true,
  mathSpoken: false,
  announceSections: false,
};
export const PROFILE_SETTINGS = {
  standard: { ...BASE },
  dyslexia: { ...BASE, theme: 'cream', textScale: 1.1, letterSpacing: 0.12, wordSpacing: 0.16, lineHeight: 1.8, measure: 65 },
  focus: { ...BASE, focusMode: true, summaries: true, lineHeight: 1.7, measure: 65 },
  screenreader: { ...BASE, minimalChrome: true, noMotion: true, readAloud: false, imageDetails: false, announceSections: true },
  lowvision: { ...BASE, theme: 'high-contrast', textScale: 1.5, measure: 60, thickFocus: true },
};

/** Set the reading profile before any app code runs. */
export async function usePrefs(page, profileId = 'standard', patch = {}) {
  await page.addInitScript(
    ({ profileId, settings }) => {
      if (window.top !== window) return;
      localStorage.setItem('flowread-access:reader-prefs', JSON.stringify({ profileId, settings, reduceMotion: false }));
    },
    { profileId, settings: { ...PROFILE_SETTINGS[profileId], ...patch } },
  );
}

/** Every API call fails as "not available" unless a test routes it. */
export async function offlineApi(page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Not available in tests.' }) }),
  );
}

/** Put the synthetic sample document into IndexedDB (the reader seeds it on first open). */
export async function seedSample(page) {
  await page.goto('/read/doc_sample');
  await expect(page.locator('h1')).toHaveText(/BIOL 1001/);
}

export async function expectNoSeriousAxe(page, label = '') {
  // Let open/close animations finish so colours are measured at full opacity.
  await expect(page.locator('[data-entering], [data-exiting]')).toHaveCount(0);
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `axe serious/critical on ${label}`).toEqual([]);
}

/** One visible h1 and no skipped heading levels (ignoring inert/aria-hidden previews). */
export async function expectHeadingOutline(page, label = '') {
  const levels = await page.evaluate(() =>
    [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter((h) => !h.closest('[aria-hidden="true"], [inert]'))
      .map((h) => Number(h.tagName[1])),
  );
  expect(levels.filter((l) => l === 1).length, `one h1 on ${label}`).toBe(1);
  let prev = 0;
  for (const l of levels) {
    expect(l, `no skipped heading on ${label} (${levels.join(',')})`).toBeLessThanOrEqual(prev + 1);
    prev = l;
  }
}

export async function expectNoHorizontalScroll(page, label = '') {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
}

/** Press Tab until the focused element matches `predicate` (max n presses). */
export async function tabTo(page, predicate, n = 40) {
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate(predicate);
    if (ok) return;
    seen.push(await page.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement?.textContent || '').trim().slice(0, 20)}`));
  }
  throw new Error(`tabTo: target never received focus. Saw: ${seen.join(' > ')}`);
}

export const MOCK_DOC = {
  id: 'doc_pasted01',
  title: 'Photosynthesis notes',
  lang: 'en',
  sourceFile: null,
  createdAt: '2026-11-25T10:00:00Z',
  source: { kind: 'text', pages: null, url: null },
  sections: [
    {
      id: 's1',
      heading: 'Light reactions',
      level: 2,
      summary: null,
      blocks: [
        { id: 'b1', type: 'paragraph', text: 'Chlorophyll absorbs light and splits water.', plain: null },
        { id: 'b2', type: 'list', ordered: false, items: ['Happens in the thylakoids', 'Makes ATP and NADPH'] },
      ],
    },
    {
      id: 's2',
      heading: 'The Calvin cycle',
      level: 2,
      summary: null,
      blocks: [{ id: 'b3', type: 'paragraph', text: 'Carbon dioxide is fixed into sugar.', plain: null }],
    },
  ],
  report: { score: 100, issues: [] },
};
