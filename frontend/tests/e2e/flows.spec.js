/* global Buffer */
import { expect, test } from '@playwright/test';
import { MOCK_DOC, expectNoSeriousAxe, offlineApi, seedSample, tabTo, usePrefs } from './helpers.js';

test.describe('import', () => {
  test('paste text, keyboard only: converts, saves and opens the reader', async ({ page }) => {
    await offlineApi(page);
    await page.route('**/api/access/convert-text', async (route) => {
      const body = route.request().postDataJSON();
      expect(body.text).toContain('Chlorophyll');
      expect(body.title).toBe('Photosynthesis notes');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DOC) });
    });
    await usePrefs(page, 'standard');
    await page.goto('/');

    await tabTo(page, () => document.activeElement?.getAttribute('role') === 'tab');
    await page.keyboard.press('ArrowRight'); // File -> Paste text
    await expect(page.getByRole('tab', { name: 'Paste text' })).toHaveAttribute('aria-selected', 'true');
    await tabTo(page, () => document.activeElement?.tagName === 'INPUT', 3); // into the panel: Title
    await page.keyboard.type('Photosynthesis notes');
    await page.keyboard.press('Tab');
    await page.keyboard.type('# Light reactions\n\nChlorophyll absorbs light and splits water.');
    await tabTo(page, () => document.activeElement?.textContent === 'Convert text', 4);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/read\/doc_pasted01$/);
    await expect(page.locator('h1')).toHaveText('Photosynthesis notes');
    await expect(page.getByRole('heading', { name: 'Light reactions' })).toBeVisible();

    await page.goto('/library');
    await expect(page.getByRole('link', { name: 'Photosynthesis notes', exact: true })).toBeVisible();
  });

  test('shows a "waking the server" state instead of a frozen spinner', async ({ page }) => {
    await offlineApi(page);
    await page.route('**/api/access/convert-text', async (route) => {
      await new Promise((r) => setTimeout(r, 6500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DOC) });
    });
    await page.goto('/');
    await page.getByRole('tab', { name: 'Paste text' }).click();
    await page.getByLabel('Text', { exact: true }).fill('Some notes to convert.');
    await page.getByRole('button', { name: 'Convert text' }).click();
    await expect(page.getByRole('heading', { name: /Converting/ })).toBeFocused();
    await expect(page.getByText(/waking the server/i)).toBeVisible({ timeout: 9000 });
    await expect(page).toHaveURL(/\/read\/doc_pasted01$/, { timeout: 10000 });
  });

  test('a failed conversion explains what happened and keeps the form usable', async ({ page }) => {
    await offlineApi(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Link' }).click();
    await page.getByLabel('Web page or PDF link').fill('not a url');
    await page.getByRole('button', { name: 'Convert page' }).click();
    await expect(page.getByText('Enter a full web address starting with https://')).toBeVisible();
    await page.getByLabel('Web page or PDF link').fill('https://example.org/article');
    await page.getByRole('button', { name: 'Convert page' }).click();
    await expect(page.getByRole('alert')).toContainText('The conversion didn’t finish');
    await expect(page.getByRole('alert')).toBeFocused();
  });

  test('file upload streams SSE progress then opens the reader', async ({ page }) => {
    await offlineApi(page);
    await page.route('**/api/access/convert', async (route) => {
      const events = [
        { type: 'progress', step: 'layout', message: 'Reading page 1 of 1…', pct: 20 },
        { type: 'progress', step: 'structure', message: 'Rebuilding headings…', pct: 80 },
        { type: 'done', doc: { ...MOCK_DOC, id: 'doc_file01', title: 'Uploaded handout', source: { kind: 'pdf', pages: 1, url: null } } },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
      });
    });
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({ name: 'handout.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await expect(page).toHaveURL(/\/read\/doc_file01$/);
    await expect(page.locator('h1')).toHaveText('Uploaded handout');
    // The original file was kept, so the side-by-side toggle is offered.
    await expect(page.getByRole('button', { name: 'Original' })).toBeVisible();
  });
});

test.describe('reader', () => {
  test('skip link, command palette jump and profile switch by keyboard', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Skip to content');
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('plasma');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'The plasma membrane' })).toBeFocused();

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('dyslexia');
    await expect(page.getByRole('menuitem', { name: /Dyslexia/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('article.rd-doc')).toHaveAttribute('data-fra-theme', 'cream');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'cream');
  });

  test('settings change the text live and bold word starts render as <b>', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    // Bold word starts are on by default (Medium).
    await expect(page.locator('#blk-b2 b.fra-bws').first()).toBeVisible();
    // Marks still apply (bold + italic from paragraph.marks).
    const strongText = await page.locator('#blk-b2 strong').allTextContents();
    expect(strongText.join('')).toBe('smallest unit');
    const emText = await page.locator('#blk-b2 em').allTextContents();
    expect(emText.join('')).toBe('look inside the cell');
    const before = await page.locator('#blk-b2').evaluate((el) => getComputedStyle(el).fontSize);
    await page.getByRole('button', { name: 'Larger text' }).click();
    const after = await page.locator('#blk-b2').evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
    // The More sheet holds the finer controls.
    await page.getByRole('button', { name: 'More' }).click();
    const slider = page.getByRole('slider', { name: 'Letter spacing' });
    await slider.focus();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
    const ls = await page.locator('#blk-b2').evaluate((el) => parseFloat(getComputedStyle(el).letterSpacing));
    expect(ls).toBeGreaterThan(0);
  });

  test('focus sessions step through sections and remember the place', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'focus');
    await seedSample(page);
    await expect(page.getByText('Section 1 of 6 · about')).toBeVisible();
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.getByText('Section 2 of 6 · about')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prokaryotic and eukaryotic cells' })).toBeFocused();
    await page.reload();
    await expect(page.getByText('Section 2 of 6 · about')).toBeVisible();
    await expect(page.getByText('Picked up where you left off')).toBeVisible();
  });

  test('selection popover via keyboard shortcut: explain simply', async ({ page }) => {
    await offlineApi(page);
    await page.route('**/api/access/plain', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plain: 'Cells are the tiny building blocks of living things.' }) }),
    );
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.evaluate(() => {
      const p = document.querySelector('#blk-b2');
      const r = document.createRange();
      r.selectNodeContents(p);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    });
    await page.keyboard.press('Control+Shift+E');
    const explain = page.getByRole('button', { name: 'Explain simply' });
    await expect(explain).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Cells are the tiny building blocks of living things.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(explain).toBeHidden();
  });

  test('selection popover: define a word (and degrade when AI is off)', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.evaluate(() => {
      const strong = document.querySelector('#blk-b2 strong');
      const r = document.createRange();
      r.selectNodeContents(strong);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    });
    await page.keyboard.press('Control+Shift+E');
    await page.getByRole('button', { name: 'Define' }).press('Enter');
    await expect(page.getByText('Definitions aren’t available right now.')).toBeVisible();
  });

  test('download dialog: PDF from the export service, keyboard only', async ({ page }) => {
    await offlineApi(page);
    let body = null;
    await page.route('**/api/export/pdf', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.7\n%mock\n%%EOF') });
    });
    await usePrefs(page, 'dyslexia');
    await seedSample(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('Download PDF');
    await expect(page.getByRole('menuitem', { name: 'Download PDF' })).toBeVisible();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Download' });
    await expect(dialog).toBeVisible();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PDF' }).focus();
    await page.keyboard.press('Enter');
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    expect(body.settings.theme).toBe('cream');
    expect(body.options).toMatchObject({ includeToc: true, includePageRefs: true });
    expect(body.doc.id).toBe('doc_sample');
  });

  test('download dialog: falls back to print when the PDF service fails', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await expect(page.getByRole('alert')).toContainText('The PDF service isn’t available right now.');
    await expect(page.getByRole('button', { name: 'Print to PDF instead' })).toBeVisible();
  });

  test('download dialog: Word and HTML files download', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Download' });
    await dialog.getByText('Word', { exact: true }).click();
    let dl = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download Word file' }).click();
    expect((await dl).suggestedFilename()).toMatch(/\.docx$/);

    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await dialog.getByText('Accessible HTML', { exact: true }).click();
    dl = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download HTML' }).click();
    expect((await dl).suggestedFilename()).toMatch(/\.html$/);
  });

  test('links in marks are sanitised', async ({ page }) => {
    await offlineApi(page);
    await seedSample(page); // creates the IndexedDB store
    await page.evaluate(async () => {
      const text = 'Safe link and bad link here.';
      const doc = {
        id: 'doc_links',
        title: 'Links',
        lang: 'en',
        sections: [
          {
            id: 's1',
            heading: 'Links',
            level: 2,
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                text,
                marks: [
                  { start: 0, end: 9, type: 'link', href: 'https://example.org/' },
                  { start: 14, end: 22, type: 'link', href: 'javascript:window.__evil=true' },
                ],
              },
            ],
          },
        ],
      };
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('flowread');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('docs', 'readwrite');
          tx.objectStore('docs').put(doc, 'doc:doc_links');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.goto('/read/doc_links');
    await expect(page.locator('#blk-b1 a')).toHaveCount(1);
    await expect(page.locator('#blk-b1 a')).toHaveAttribute('href', 'https://example.org/');
  });
});

test.describe('library', () => {
  test('delete with undo', async ({ page }) => {
    await offlineApi(page);
    await seedSample(page);
    await page.goto('/library');
    await page.getByRole('button', { name: /More actions for BIOL 1001/ }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByText(/Deleted “BIOL 1001/)).toBeVisible();
    await expect(page.getByRole('link', { name: /BIOL 1001/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('link', { name: /BIOL 1001/ }).first()).toBeVisible();
  });

  test('old /access paths redirect to /workspace', async ({ page }) => {
    await offlineApi(page);
    await page.goto('/access');
    await expect(page).toHaveURL(/\/workspace$/);
    await page.goto('/reader');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('extension bridge', () => {
  test('ready shows the connected indicator, settings sync, and openDoc opens the reader', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    const sent = [];
    await page.exposeFunction('__record', (m) => sent.push(m));
    await page.evaluate(() =>
      window.addEventListener('message', (e) => {
        if (e.data?.source === 'flowread-app') window.__record(e.data);
      }),
    );
    await page.evaluate(() => window.postMessage({ source: 'flowread-ext', type: 'ready', version: '0.1.0' }, '*'));
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByText('Extension connected (0.1.0)')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => sent.some((m) => m.type === 'setSettings')).toBe(true);
    expect(sent.find((m) => m.type === 'setSettings').profileId).toBe('standard');
    await page.waitForTimeout(1600); // connect-time grace period for the extension's stored settings

    await page.evaluate(() =>
      window.postMessage({ source: 'flowread-ext', type: 'settings', settings: { theme: 'dark', font: 'lexend' } }, '*'),
    );
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');

    // Messages from other windows are ignored.
    await page.evaluate(() => {
      const f = document.createElement('iframe');
      document.body.appendChild(f);
      f.contentWindow.eval("parent.postMessage({ source: 'flowread-ext', type: 'settings', settings: { theme: 'cream' } }, '*')");
    });
    await page.waitForTimeout(200);
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');

    await page.evaluate(
      (doc) => window.postMessage({ source: 'flowread-ext', type: 'openDoc', doc }, '*'),
      { ...MOCK_DOC, id: 'doc_fromext', title: 'From the extension' },
    );
    await expect(page).toHaveURL(/\/read\/doc_fromext$/);
    await expect(page.locator('h1')).toHaveText('From the extension');
  });
});


test.describe('reading bar and profiles', () => {
  const boldLen = (page) =>
    page.locator('#blk-b2 b.fra-bws').evaluateAll((els) => els.reduce((n, el) => n + el.textContent.length, 0));

  test('bold strength changes how much of each word is bold, and Off removes it', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    const medium = await boldLen(page);
    await page.getByRole('radio', { name: 'Strong' }).check({ force: true });
    await expect.poll(() => boldLen(page)).toBeGreaterThan(medium);
    await page.getByRole('radio', { name: 'Light' }).check({ force: true });
    await expect.poll(() => boldLen(page)).toBeLessThan(medium);
    await page.getByRole('radio', { name: 'Off' }).check({ force: true });
    await expect(page.locator('#blk-b2 b.fra-bws')).toHaveCount(0);
  });

  test('each profile looks different', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    const look = () =>
      page.evaluate(() => {
        const p = document.querySelector('#blk-b2');
        const cs = getComputedStyle(p);
        return {
          bold: [...document.querySelectorAll('#blk-b2 b.fra-bws')].reduce((n, el) => n + el.textContent.length, 0),
          ls: cs.letterSpacing,
          size: cs.fontSize,
          bg: getComputedStyle(document.querySelector('.rd')).backgroundColor,
          focusLine: !!document.querySelector('.fra-focusline'),
          timer: !!document.querySelector('.rtimer'),
        };
      });
    const seen = {};
    for (const id of ['standard', 'dyslexia', 'focus', 'screenreader', 'lowvision']) {
      await page.selectOption('.rbar-select', id);
      seen[id] = await look();
    }
    const keys = Object.values(seen).map((v) => JSON.stringify(v));
    expect(new Set(keys).size).toBe(5);
    expect(seen.focus.focusLine && seen.focus.timer).toBe(true);
    expect(seen.standard.focusLine).toBe(false);
    expect(seen.screenreader.bold).toBe(0);
    expect(seen.focus.bold).toBeGreaterThan(seen.standard.bold);
    expect(seen.dyslexia.bold).toBeLessThan(seen.standard.bold);
  });

  test('F toggles the focus line, which follows the pointer', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.locator('h1').click();
    await page.keyboard.press('f');
    await expect(page.locator('.fra-focusline-band')).toBeVisible();
    await page.mouse.move(600, 500);
    await expect.poll(async () => page.locator('.fra-focusline-band').evaluate((el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2)).toBeGreaterThan(480);
    await page.keyboard.press('f');
    await expect(page.locator('.fra-focusline')).toHaveCount(0);
  });
});

test.describe('flashcards', () => {
  const CARDS = [
    { front: 'What controls what enters the cell?', back: 'The plasma membrane.', kind: 'concept', sectionId: 's3' },
    { front: 'Where is DNA kept in eukaryotic cells?', back: 'In the nucleus.', kind: 'concept', sectionId: 's2' },
    { front: 'Cells divide instead of growing because of the ____ ratio.', back: 'surface-area-to-volume', kind: 'cloze', sectionId: 's5' },
    { front: 'What do ribosomes build?', back: 'Proteins.', kind: 'term', sectionId: 's4' },
  ];

  test('make cards, practise them by keyboard, then take the quiz', async ({ page }) => {
    await offlineApi(page);
    await page.route('**/api/access/flashcards', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: CARDS }) }),
    );
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.getByRole('tab', { name: 'Summary' }).click();
    await page.getByRole('button', { name: 'Make flashcards' }).click();
    const dialog = page.getByRole('dialog', { name: 'Check what you remember' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Make flashcards' }).click();
    await expect(dialog.getByText('0 of 4 known')).toBeVisible();
    await expectNoSeriousAxe(page, 'flashcards');
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Space');
      await page.keyboard.press('2');
    }
    await expect(dialog.getByText('All 4 cards done')).toBeVisible();
    await dialog.getByRole('button', { name: 'Take the quiz' }).click();
    await expect(dialog.getByText('Question 1 of 4')).toBeVisible();
    await dialog.locator('.fc-option').first().click();
    await expect(dialog.locator('.fc-option.is-right')).toHaveCount(1);
    await page.keyboard.press('Escape');
    // Cards are saved with the document.
    await page.reload();
    await page.getByRole('tab', { name: 'Summary' }).click();
    await expect(page.getByRole('button', { name: 'Practise 4 flashcards' })).toBeVisible();
  });

  test('without the AI service the dialog says so', async ({ page }) => {
    await offlineApi(page);
    await usePrefs(page, 'standard');
    await seedSample(page);
    await page.getByRole('tab', { name: 'Summary' }).click();
    await page.getByRole('button', { name: 'Make flashcards' }).click();
    const dialog = page.getByRole('dialog', { name: 'Check what you remember' });
    await dialog.getByRole('button', { name: 'Make flashcards' }).click();
    await expect(dialog.getByRole('alert')).toContainText('AI service');
  });
});
