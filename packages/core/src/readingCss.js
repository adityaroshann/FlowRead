// Reading settings -> plain CSS text. Used where React and the reader's CSS
// variables are not available: the browser extension (styling someone else's
// page) and the print/PDF fallback.
import { resolveSettings } from './profiles.js';

// Theme colours. Every text/background pair is at least 4.5:1 (most are 7:1+).
// Keep in sync with frontend/src/styles/themes.css and backend/export themes.
export const THEME_COLORS = Object.freeze({
  light: { bg: '#FAF7F0', text: '#1F1B16', muted: '#5C554B', accent: '#0F6B6B', mark: '#FFE58A' },
  cream: { bg: '#F4ECD8', text: '#2B2418', muted: '#5A4E3B', accent: '#0F5F5F', mark: '#FFE08A' },
  dark: { bg: '#1C1A17', text: '#E8E2D6', muted: '#B5AC9C', accent: '#6FCFC4', mark: '#5C4A12' },
  'high-contrast': { bg: '#000000', text: '#FFFFFF', muted: '#E6E6E6', accent: '#FFE600', mark: '#00468C' },
});

// Font stacks by settings.font id. The extension ships these fonts itself; the
// names here must match the @font-face families it injects.
export const FONT_FAMILIES = Object.freeze({
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  atkinson: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', Verdana, Tahoma, sans-serif",
  lexend: "'Lexend', 'Atkinson Hyperlegible Next', Verdana, sans-serif",
  dyslexic: "'OpenDyslexic', Verdana, sans-serif",
  serif: "'Literata', Georgia, 'Times New Roman', serif",
});

const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

/**
 * CSS that restyles arbitrary page text inside `scope` (default: the whole page).
 * Options:
 *   scope       selector that limits the rules, e.g. 'html.flowread-on'
 *   recolor     also apply the theme background/text colours (default true)
 *   boldClass   class used for bold word starts (default 'fr-b')
 */
export function readingCss(settings, { scope = 'html.flowread-on', recolor = true, boldClass = 'fr-b' } = {}) {
  const s = resolveSettings(settings);
  const ls = num(s.letterSpacing, 0, 0.35, 0);
  const ws = num(s.wordSpacing, 0, 0.5, 0);
  const lh = num(s.lineHeight, 1.2, 2.4, 1.6);
  const scale = num(s.textScale, 0.8, 2, 1);
  const font = FONT_FAMILIES[s.font] || FONT_FAMILIES.system;
  const c = THEME_COLORS[s.theme] || THEME_COLORS.light;
  // Text-bearing elements only; never form controls, code or icons.
  const text = ['p', 'li', 'dd', 'dt', 'td', 'th', 'blockquote', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'em', 'strong', 'label', 'article', 'section', 'div']
    .map((t) => `${scope} body ${t}:not(pre *):not(code):not([class*="icon"]):not([aria-hidden="true"])`)
    .join(',\n');

  const rules = [
    `${text} {
  font-family: ${font} !important;
  letter-spacing: ${ls}em !important;
  word-spacing: ${ws}em !important;
  line-height: ${lh} !important;
}`,
    `${scope} body p, ${scope} body li { max-width: ${num(s.measure, 40, 100, 70)}ch; }`,
    scale !== 1 ? `${scope} { font-size: ${Math.round(scale * 100)}% !important; }` : '',
    `${scope} b.${boldClass} { font-weight: 700 !important; color: inherit !important; }`,
  ];

  if (recolor) {
    rules.push(`${scope}, ${scope} body { background: ${c.bg} !important; color: ${c.text} !important; }
${scope} body *:not(img):not(video):not(canvas):not(svg):not(svg *) {
  background-color: transparent !important;
  color: ${c.text} !important;
  border-color: ${c.muted} !important;
}
${scope} body a, ${scope} body a * { color: ${c.accent} !important; text-decoration: underline !important; }
${scope} ::selection { background: ${c.mark}; color: ${c.text}; }`);
  }
  return rules.filter(Boolean).join('\n');
}

/**
 * @page rules plus body styling for printing a FlowRead document to PDF from
 * the browser (offline fallback when the export service is unavailable).
 */
export function printCss(settings, { pageSize = 'A4' } = {}) {
  const s = resolveSettings(settings);
  const c = THEME_COLORS[s.theme] || THEME_COLORS.light;
  const size = pageSize === 'Letter' ? 'letter' : 'A4';
  return `@page { size: ${size}; margin: 18mm 20mm; }
@media print {
  html, body { background: ${c.bg} !important; color: ${c.text} !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2, h3, h4 { break-after: avoid; }
  table, figure, li { break-inside: avoid; }
}`;
}
