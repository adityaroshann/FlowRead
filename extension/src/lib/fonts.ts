// @font-face rules for the bundled OFL fonts. Family names match
// FONT_FAMILIES in @flowread/core/readingCss.js. `url` maps a public path to
// an extension URL (browser.runtime.getURL in the content script).
const FACES: [family: string, file: string, weight: string][] = [
  ['Atkinson Hyperlegible Next', 'atkinson-hyperlegible-next-latin-400-normal.woff2', '400'],
  ['Atkinson Hyperlegible Next', 'atkinson-hyperlegible-next-latin-700-normal.woff2', '700'],
  ['OpenDyslexic', 'opendyslexic-latin-400-normal.woff2', '400'],
  ['OpenDyslexic', 'opendyslexic-latin-700-normal.woff2', '700'],
  ['Lexend', 'lexend-latin-wght-normal.woff2', '100 900'],
  ['Literata', 'literata-latin-wght-normal.woff2', '200 900'],
];

export function fontFaceCss(url: (path: string) => string): string {
  return FACES.map(
    ([family, file, weight]) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url("${url(`/fonts/${file}`)}") format("woff2");}`,
  ).join('\n');
}
