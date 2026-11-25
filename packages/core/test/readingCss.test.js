import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingCss, printCss } from '../src/readingCss.js';
import { settingsForProfile } from '../src/profiles.js';

test('readingCss scopes every rule and reflects the profile', () => {
  const css = readingCss(settingsForProfile('dyslexia'));
  assert.match(css, /letter-spacing: 0\.12em/);
  assert.match(css, /Atkinson Hyperlegible/);
  for (const line of css.split('\n')) if (line.includes('{') && !line.startsWith(' ')) assert.match(line, /html\.flowread-on/);
});

test('readingCss without recolor leaves page colours alone', () => {
  assert.doesNotMatch(readingCss({}, { recolor: false }), /background/);
});

test('printCss sets the page size', () => {
  assert.match(printCss({}, { pageSize: 'Letter' }), /size: letter/);
});
