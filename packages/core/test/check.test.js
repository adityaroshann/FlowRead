import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDoc } from '../src/check.js';

const doc = (blocks) => ({ title: 'T', lang: 'en', sections: [{ id: 's1', heading: 'A', level: 2, blocks }] });

test('page-needs-ocr replaces alt-text rules for scanned pages', () => {
  const r = checkDoc(doc([{ id: 'b1', type: 'image', origin: 'page', alt: '', altStatus: 'missing', src: '' }]));
  assert.deepEqual(r.issues.map((i) => i.rule), ['page-needs-ocr']);
  assert.equal(r.score, 92);
});
