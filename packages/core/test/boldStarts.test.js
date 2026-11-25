import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitWordStart, boldSegments, boldRanges } from '../src/boldStarts.js';

const fx = JSON.parse(readFileSync(new URL('../fixtures/boldStarts.json', import.meta.url), 'utf8'));

test('splitWordStart matches the shared fixture', () => {
  for (const [word, expected] of fx.words) assert.deepEqual(splitWordStart(word), expected, word);
});

test('boldSegments matches the shared fixture and covers the whole input', () => {
  for (const [text, expected] of fx.texts) {
    const segs = boldSegments(text);
    assert.deepEqual(segs.map((s) => [s.text, s.bold]), expected, JSON.stringify(text));
    assert.equal(segs.map((s) => s.text).join(''), text);
  }
});

test('boldRanges are in order and inside the text', () => {
  const t = 'Cells divide by mitosis.';
  let last = -1;
  for (const r of boldRanges(t)) {
    assert.ok(r.start > last && r.end > r.start && r.end <= t.length);
    last = r.end;
  }
});
