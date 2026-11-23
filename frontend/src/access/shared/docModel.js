// Pure helpers over the AccessDoc model, shared by the React renderer,
// the static HTML exporter and the checker. No DOM, no React.

export const WORDS_PER_MINUTE = 200;

const WORD_RE = /[^\s]+/g;

export function wordCount(text) {
  if (typeof text !== 'string' || !text) return 0;
  const m = String(text).match(WORD_RE);
  return m ? m.length : 0;
}

/** Plain text of one block (what a reader would read aloud / what counts as words). */
export function blockText(block) {
  if (!block) return '';
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return block.text || '';
    case 'list':
      return (block.items || []).join('\n');
    case 'table':
      return [
        block.caption || '',
        ...(block.headers || []),
        ...(block.rows || []).map((r) => (r || []).join(' ')),
      ]
        .filter(Boolean)
        .join('\n');
    case 'math':
      return block.spoken || block.text || block.latex || '';
    case 'image':
      return block.caption || '';
    default:
      return '';
  }
}

/**
 * Words that count toward reading time and the `section-too-long` rule.
 * Mirrors backend/access/check.py `_block_words`: heading/paragraph text,
 * list items, table caption + headers + cells, math text, image caption.
 */
export function blockWordCount(block) {
  if (!block) return 0;
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return wordCount(block.text);
    case 'list':
      return (block.items || []).reduce((n, it) => n + wordCount(it), 0);
    case 'table':
      return (
        wordCount(block.caption) +
        (block.headers || []).reduce((n, h) => n + wordCount(h), 0) +
        (block.rows || []).reduce(
          (n, row) => n + (row || []).reduce((m, c) => m + wordCount(c), 0),
          0,
        )
      );
    case 'math':
      return wordCount(block.text);
    case 'image':
      return wordCount(block.caption);
    default:
      return 0;
  }
}

/** Section heading + all block words (same as the backend checker). */
export function sectionWordCount(section) {
  return (
    wordCount(section?.heading) + (section?.blocks || []).reduce((n, b) => n + blockWordCount(b), 0)
  );
}

/** Section heading + readable text, used for summaries. */
export function sectionText(section) {
  const parts = [];
  for (const b of section?.blocks || []) {
    const t = blockText(b);
    if (t) parts.push(t);
  }
  return parts.join('\n\n');
}

export function readingMinutes(words, wpm = WORDS_PER_MINUTE) {
  if (!words) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

const clampLevel = (n) => Math.min(6, Math.max(2, Number.isFinite(n) ? n : 2));

/**
 * Compute rendered heading levels with no skipped levels, given that the
 * document title is the only <h1>. Returns Map: key -> level, where keys are
 * `sec:<sectionId>` and `blk:<blockId>`. Declared levels are kept when they
 * don't skip; deeper jumps are pulled up to prev+1.
 */
export function headingLevels(sections) {
  const map = new Map();
  let prev = 1;
  for (const sec of sections || []) {
    if (sec.heading && sec.heading.trim()) {
      const lvl = clampLevel(Math.min(sec.level ?? 2, prev + 1));
      map.set(`sec:${sec.id}`, lvl);
      prev = lvl;
    }
    for (const b of sec.blocks || []) {
      if (b.type !== 'heading') continue;
      const lvl = clampLevel(Math.min(b.level ?? prev + 1, prev + 1));
      map.set(`blk:${b.id}`, lvl);
      prev = lvl;
    }
  }
  return map;
}

/** Tokenise text into words and whitespace with character offsets. */
export function tokenize(text) {
  const out = [];
  const re = /\s+|[^\s]+/g;
  let m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    out.push({ text: m[0], start: m.index, space: /^\s/.test(m[0]) });
  }
  return out;
}

/**
 * Split a word into [prefix, boldPart, rest] for "bold word starts".
 * Leading punctuation is left unbolded.
 */
export function splitWordStart(word) {
  const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)(.*)$/u.exec(word);
  if (!m) return ['', '', word];
  const [, pre, core, post] = m;
  const n = core.length <= 3 ? 1 : Math.ceil(core.length * 0.4);
  return [pre, core.slice(0, n), core.slice(n) + post];
}

/** Only allow inline raster/SVG data URLs (and http(s)) as image sources. */
export function safeImageSrc(src) {
  if (typeof src !== 'string') return '';
  const s = src.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

export function imageAlt(block) {
  if (block.altStatus === 'decorative') return '';
  const alt = (block.alt || '').trim();
  return alt || 'Image (no description available yet)';
}

export function tableCaption(block, n) {
  return (block.caption && block.caption.trim()) || `Table ${n}`;
}

/** Map blockId -> 1-based table number in document order. */
export function tableNumbers(doc) {
  const map = new Map();
  let n = 0;
  for (const s of doc?.sections || []) {
    for (const b of s.blocks || []) if (b.type === 'table') map.set(b.id, ++n);
  }
  return map;
}

export function sectionLabel(section, index) {
  return (section.heading && section.heading.trim()) || (index === 0 ? 'Introduction' : `Section ${index + 1}`);
}

export function slugify(s) {
  return (
    String(s || 'document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document'
  );
}
