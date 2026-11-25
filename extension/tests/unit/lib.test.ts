import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@flowread/core';
import { sanitizeSettings, sanitizeSites, sanitizeProfileId, isPdfUrl, originOf } from '../../src/lib/schema';
import { readSse } from '../../src/lib/sse';

describe('settings validation (bridge input)', () => {
  it('keeps only known keys with the right types, clamps ranges', () => {
    const s = sanitizeSettings({ theme: 'dark', font: 'comic', textScale: 9, boldStarts: 'yes', focusLine: true, evil: 1, letterSpacing: NaN });
    expect(s.theme).toBe('dark');
    expect(s.font).toBe(DEFAULT_SETTINGS.font);
    expect(s.textScale).toBe(2);
    expect(s.boldStarts).toBe(false);
    expect(s.focusLine).toBe(true);
    expect(s.letterSpacing).toBe(0);
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });
  it('validates profiles, sites and urls', () => {
    expect(sanitizeProfileId('dyslexia')).toBe('dyslexia');
    expect(sanitizeProfileId('__proto__')).toBeNull();
    expect(sanitizeSites({ sites: ['https://a.org', 'javascript:x', 'https://a.org', 'https://b.org/path'], all: 1 })).toEqual({ sites: ['https://a.org'], all: false });
    expect(isPdfUrl('https://x.org/files/Notes.PDF?dl=1')).toBe(true);
    expect(isPdfUrl('https://x.org/pdf')).toBe(false);
    expect(originOf('chrome://settings')).toBeNull();
  });
});

describe('SSE reader', () => {
  it('parses events split across chunks, ignores junk, handles a final event without blank line', async () => {
    const parts = ['data: {"type":"progress","pct":10}\n', '\ndata: not json\n\n: keep-alive\n\ndata: {"type":"pro', 'gress","pct":50}\r\n\r\ndata: {"type":"done","doc":{"id":"x"}}'];
    const body = new ReadableStream({
      start(c) {
        parts.forEach((p) => c.enqueue(new TextEncoder().encode(p)));
        c.close();
      },
    });
    const out: unknown[] = [];
    for await (const ev of readSse(new Response(body))) out.push(ev);
    expect(out).toEqual([
      { type: 'progress', pct: 10 },
      { type: 'progress', pct: 50 },
      { type: 'done', doc: { id: 'x' } },
    ]);
  });
});
