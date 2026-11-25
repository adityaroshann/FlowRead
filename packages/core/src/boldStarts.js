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

// Scripts where splitting a word across bold/regular runs breaks letter joining
// or syllable shaping (Arabic family, Hebrew presentation forms, Indic,
// South-East Asian), or where there are no spaces between words (CJK, kana).
// Words containing any of these characters are left whole.
// Ranges: U+0600-08FF, U+0900-0DFF, U+0E00-0FFF, U+1000-109F, U+1780-18AF,
// U+3040-30FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FB1D-FDFF, U+FE70-FEFF.
export const COMPLEX_SCRIPT_RE =
  /[؀-ࣿऀ-෿฀-࿿က-႟ក-᢯぀-ヿ㐀-䶿一-鿿豈-﫿יִ-﷿ﹰ-﻿]/u;

/** True when a word must not be split (see COMPLEX_SCRIPT_RE). */
export function isComplexScript(text) {
  return COMPLEX_SCRIPT_RE.test(String(text ?? ''));
}

// Strength presets (share of each word that is bold), as in the original app.
export const BOLD_INTENSITY = Object.freeze({ light: 0.35, medium: 0.45, strong: 0.55 });
export const DEFAULT_BOLD_RATIO = BOLD_INTENSITY.medium;

function ratioOf(r) {
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? Math.min(0.8, Math.max(0.2, n)) : DEFAULT_BOLD_RATIO;
}

/** How many characters of a word core to bold at a given ratio. */
export function boldLength(coreLength, ratio = DEFAULT_BOLD_RATIO) {
  if (coreLength <= 0) return 0;
  if (coreLength <= 3) return 1;
  // Round to 6 decimals first so 0.55 * 20 (= 11.000000000000002) doesn't round up.
  return Math.min(coreLength, Math.ceil(Number((coreLength * ratioOf(ratio)).toFixed(6))));
}

/**
 * Split one whitespace-free token into [prefix, boldPart, rest].
 * Tokens with no letters or digits come back as ['', '', token].
 */
export function splitWordStart(word, ratio = DEFAULT_BOLD_RATIO) {
  const s = String(word ?? '');
  const m = WORD_RE.exec(s);
  if (!m) return ['', '', s];
  const [, pre, core, post] = m;
  if (isComplexScript(core)) return ['', '', s];
  const n = boldLength([...core].length, ratio);
  const chars = [...core];
  return [pre, chars.slice(0, n).join(''), chars.slice(n).join('') + post];
}

/**
 * Bold ranges for a whole string, as UTF-16 offsets [{start, end}], in order.
 * Whitespace separates words. Renderers wrap text.slice(start, end) in bold.
 */
export function boldRanges(text, ratio = DEFAULT_BOLD_RATIO) {
  const s = String(text ?? '');
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) {
    const [pre, bold] = splitWordStart(m[0], ratio);
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
export function boldSegments(text, ratio = DEFAULT_BOLD_RATIO) {
  const s = String(text ?? '');
  const segs = [];
  let at = 0;
  for (const { start, end } of boldRanges(s, ratio)) {
    if (start > at) segs.push({ text: s.slice(at, start), bold: false });
    segs.push({ text: s.slice(start, end), bold: true });
    at = end;
  }
  if (at < s.length) segs.push({ text: s.slice(at), bold: false });
  return segs;
}
