import { expect, test } from '@playwright/test';
import {
  PROFILES,
  expectHeadingOutline,
  expectNoHorizontalScroll,
  expectNoSeriousAxe,
  offlineApi,
  seedSample,
  usePrefs,
} from './helpers.js';

const ROUTES = [
  { path: '/', h1: /Study material/ },
  { path: '/library', h1: /Library/ },
  { path: '/read/doc_sample', h1: /BIOL 1001/ },
  { path: '/read/doc_sample/edit', h1: /BIOL 1001/ },
  { path: '/workspace', h1: /Accessible course materials/ },
  { path: '/workspace/new', h1: /./ },
  { path: '/workspace/review/doc_sample', h1: /BIOL 1001/ },
];

for (const profile of PROFILES) {
  test.describe(`profile: ${profile}`, () => {
    for (const route of ROUTES) {
      test(`${route.path} has no serious axe issues and a sound outline`, async ({ page }) => {
        await offlineApi(page);
        await usePrefs(page, profile);
        await seedSample(page);
        await page.goto(route.path);
        await expect(page.locator('h1').first()).toHaveText(route.h1);
        await expectNoSeriousAxe(page, `${route.path} (${profile})`);
        await expectHeadingOutline(page, `${route.path} (${profile})`);
      });
    }

    test(`reader dialogs have no serious axe issues (${profile})`, async ({ page }) => {
      await offlineApi(page);
      await usePrefs(page, profile);
      await seedSample(page);
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
      await expectNoSeriousAxe(page, `palette (${profile})`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Download', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Download' })).toBeVisible();
      await expectNoSeriousAxe(page, `download dialog (${profile})`);
    });
  });
}

test.describe('reflow at 320 CSS px (200% zoom on a 640 px window)', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const route of ROUTES) {
    for (const profile of ['standard', 'lowvision', 'dyslexia']) {
      test(`${route.path} (${profile}) has no horizontal scroll`, async ({ page }) => {
        await offlineApi(page);
        await usePrefs(page, profile);
        await seedSample(page);
        await page.goto(route.path);
        await expect(page.locator('h1').first()).toBeVisible();
        await expectNoHorizontalScroll(page, `${route.path} (${profile})`);
      });
    }
  }

  test('the mobile sheet (contents and summary) and More sheet pass axe', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.getByRole('button', { name: 'Contents and summary' }).click();
    await expect(page.getByRole('dialog', { name: 'Contents and summary' })).toBeVisible();
    await expectNoSeriousAxe(page, 'mobile sheet');
    await page.getByRole('tab', { name: 'Summary' }).click();
    await expectNoSeriousAxe(page, 'mobile sheet summary');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog', { name: 'More reading settings' })).toBeVisible();
    await expectNoSeriousAxe(page, 'more sheet');
  });
});

test('focus is always visible on interactive elements in the reader', async ({ page }) => {
  await offlineApi(page);
  await usePrefs(page, 'standard');
  await seedSample(page);
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'none';
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 ? 'ok' : `${el.tagName}.${el.className}:${cs.outlineStyle}`;
    });
    expect(outline).toBe('ok');
  }
});
