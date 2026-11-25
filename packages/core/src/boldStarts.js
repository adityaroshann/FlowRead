// "Bold word starts": bold the first few letters of each word.
//
// One algorithm, used in three places that must agree exactly:
//   - the web reader (React elements, never HTML strings)
//   - the browser extension (DOM text nodes, via DocumentFragment)
//   - the PDF exporter (backend/export/bold_starts.py, a line-for-line port)
// fixtures/boldStarts.json is the shared test table; both test suites read it.
//
// Do not call this "Bionic Reading" anywhere: that name is a registered trademark.

// A word core starts with a letter or digit and may continue with letters,
// digits, apostrophes and hyphens. Anything before it (quotes, brackets) stays
// regular; anything after it (punctuation) also stays regular.
const WORD_RE = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)(.*)$/su;

/** How many characters of a word core to bold. */
export function boldLength(coreLength) {
  if (coreLength <= 0) return 0;
  if (coreLength <= 3) return 1;
  return Math.ceil(coreLength * 0.4);
}

/**
 * Split one whitespace-free token into [prefix, boldPart, rest].
 * Tokens with no letters or digits come back as ['', '', token].
 */
export function splitWordStart(word) {
  const s = String(word ?? '');
  const m = WORD_RE.exec(s);
  if (!m) return ['', '', s];
  const [, pre, core, post] = m;
  const n = boldLength([...core].length);
  const chars = [...core];
  return [pre, chars.slice(0, n).join(''), chars.slice(n).join('') + post];
}

/**
 * Bold ranges for a whole string, as UTF-16 offsets [{start, end}], in order.
 * Whitespace separates words. Renderers wrap text.slice(start, end) in bold.
 */
export function boldRanges(text) {
  const s = String(text ?? '');
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) {
    const [pre, bold] = splitWordStart(m[0]);
    if (!bold) continue;
    const start = m.index + pre.length;
    out.push({ start, end: start + bold.length });
  }
  return out;
}

/**
 * Split text into alternating segments [{text, bold}] covering the whole input.
 * Handy for renderers that build nodes one segment at a time.
 */
export function boldSegments(text) {
  const s = String(text ?? '');
  const segs = [];
  let at = 0;
  for (const { start, end } of boldRanges(s)) {
    if (start > at) segs.push({ text: s.slice(at, start), bold: false });
    segs.push({ text: s.slice(start, end), bold: true });
    at = end;
  }
  if (at < s.length) segs.push({ text: s.slice(at), bold: false });
  return segs;
}
