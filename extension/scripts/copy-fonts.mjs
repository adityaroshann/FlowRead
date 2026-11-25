// Copies the OFL font files the extension bundles from the web app's
// node_modules (latin subset, regular + bold, or the variable file).
// Run once after `npm install` in frontend/: `npm run fonts`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = path.resolve(here, '../../frontend/node_modules');
const out = path.resolve(here, '../public/fonts');
mkdirSync(path.join(out, 'licenses'), { recursive: true });

const FONTS = [
  ['@fontsource/atkinson-hyperlegible-next', ['atkinson-hyperlegible-next-latin-400-normal.woff2', 'atkinson-hyperlegible-next-latin-700-normal.woff2'], 'atkinson-hyperlegible-next'],
  ['@fontsource/opendyslexic', ['opendyslexic-latin-400-normal.woff2', 'opendyslexic-latin-700-normal.woff2'], 'opendyslexic'],
  ['@fontsource-variable/lexend', ['lexend-latin-wght-normal.woff2'], 'lexend'],
  ['@fontsource-variable/literata', ['literata-latin-wght-normal.woff2'], 'literata'],
];

for (const [pkg, files, name] of FONTS) {
  for (const f of files) copyFileSync(path.join(nm, pkg, 'files', f), path.join(out, f));
  copyFileSync(path.join(nm, pkg, 'LICENSE'), path.join(out, 'licenses', `${name}-OFL.txt`));
  const version = JSON.parse(readFileSync(path.join(nm, pkg, 'package.json'), 'utf8')).version;
  console.log(`${pkg}@${version}: ${files.length} file(s)`);
}
writeFileSync(
  path.join(out, 'licenses', 'README.txt'),
  'All bundled fonts are licensed under the SIL Open Font License 1.1 (see the *-OFL.txt files).\n' +
    'Files are the unmodified latin subsets published by Fontsource (fontsource.org).\n',
);
