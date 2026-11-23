// Reading-profile presets. A profile is a starting point; students can then
// fine-tune any setting. Settings are plain JSON so they persist easily.

export const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'cream', label: 'Cream' },
  { id: 'dark', label: 'Dark' },
  { id: 'high-contrast', label: 'High contrast' },
];

export const FONTS = [
  { id: 'system', label: 'Sans-serif (system)' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible' },
  { id: 'dyslexic', label: 'OpenDyslexic' },
  { id: 'serif', label: 'Serif' },
];

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light', // THEMES id
  font: 'system', // FONTS id
  textScale: 1, // 1 = 100% ... 2 = 200%
  letterSpacing: 0, // em
  wordSpacing: 0, // em
  lineHeight: 1.6,
  measure: 70, // max line length in ch
  boldStarts: false, // bold the first letters of each word
  readAloud: true, // show read-aloud controls (word highlighting)
  plainLanguage: true, // show per-paragraph "Plain language" buttons
  focusMode: false, // one section at a time with Next/Back
  summaries: false, // show "In this section" summary box
  focusLine: false, // reading-line overlay
  noMotion: false, // disable all motion (also honours prefers-reduced-motion)
  minimalChrome: false, // hide decorative/non-essential UI
  thickFocus: false, // heavier focus rings
  imageDetails: true, // visible "Image description" disclosure under figures
  mathSpoken: false, // show the spoken reading of math visibly too
  announceSections: false, // announce section count / changes in a live region
});

export const PROFILES = {
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'The document as published, with comfortable defaults.',
    settings: { ...DEFAULT_SETTINGS },
  },
  dyslexia: {
    id: 'dyslexia',
    label: 'Dyslexia',
    description:
      'Wider letter and word spacing, taller lines, shorter line length, a cream background, a clear font, read-aloud with word highlighting and plain-language rewrites.',
    settings: {
      ...DEFAULT_SETTINGS,
      theme: 'cream',
      font: 'atkinson',
      textScale: 1.1,
      letterSpacing: 0.12,
      wordSpacing: 0.16,
      lineHeight: 1.8,
      measure: 65,
      boldStarts: false,
      readAloud: true,
      plainLanguage: true,
    },
  },
  focus: {
    id: 'focus',
    label: 'ADHD / Focus',
    description:
      'One section at a time with a short summary first, progress and time left, and it remembers where you stopped.',
    settings: {
      ...DEFAULT_SETTINGS,
      focusMode: true,
      summaries: true,
      lineHeight: 1.7,
      measure: 65,
      readAloud: true,
    },
  },
  screenreader: {
    id: 'screenreader',
    label: 'Screen reader',
    description:
      'Minimal interface with no motion, clear landmarks, full image descriptions, spoken math and announced section counts.',
    settings: {
      ...DEFAULT_SETTINGS,
      minimalChrome: true,
      noMotion: true,
      readAloud: false,
      imageDetails: false,
      announceSections: true,
    },
  },
  lowvision: {
    id: 'lowvision',
    label: 'Low vision',
    description: 'Larger text (up to 200%), high contrast, thick focus rings and large controls. Text reflows without sideways scrolling.',
    settings: {
      ...DEFAULT_SETTINGS,
      theme: 'high-contrast',
      font: 'atkinson',
      textScale: 1.5,
      lineHeight: 1.6,
      measure: 60,
      thickFocus: true,
    },
  },
};

export const PROFILE_ORDER = ['standard', 'dyslexia', 'focus', 'screenreader', 'lowvision'];

export function getProfile(id) {
  return PROFILES[id] || PROFILES.standard;
}

/** Copy of a profile's preset settings. */
export function settingsForProfile(id) {
  return { ...getProfile(id).settings };
}

/**
 * Accepts a profile id ("dyslexia"), a profile object ({settings}), a settings
 * object, or nothing, and returns a complete settings object.
 */
export function resolveSettings(profile) {
  if (!profile) return { ...DEFAULT_SETTINGS };
  if (typeof profile === 'string') return settingsForProfile(profile);
  if (profile.settings && typeof profile.settings === 'object') return { ...DEFAULT_SETTINGS, ...profile.settings };
  return { ...DEFAULT_SETTINGS, ...profile };
}

const FONT_STACKS = {
  system: "var(--font-system, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif)",
  atkinson: "var(--font-atkinson, 'Atkinson Hyperlegible'), Verdana, Tahoma, sans-serif",
  dyslexic: "var(--font-dyslexic, 'OpenDyslexic'), Verdana, sans-serif",
  serif: "var(--font-body, Georgia), Georgia, 'Times New Roman', serif",
};

const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

/** CSS custom properties for the renderer/reader root. */
export function settingsToStyle(settings) {
  const s = resolveSettings(settings);
  return {
    '--fra-scale': String(clamp(s.textScale, 0.8, 2, 1)),
    '--fra-ls': `${clamp(s.letterSpacing, 0, 0.35, 0)}em`,
    '--fra-ws': `${clamp(s.wordSpacing, 0, 0.5, 0)}em`,
    '--fra-lh': String(clamp(s.lineHeight, 1.2, 2.4, 1.6)),
    '--fra-measure': `${clamp(s.measure, 40, 100, 70)}ch`,
    '--fra-font': FONT_STACKS[s.font] || FONT_STACKS.system,
    // Wider paragraph gaps when spacing is widened (WCAG 1.4.12 style spacing)
    '--fra-gap': Number(s.letterSpacing) >= 0.1 || Number(s.lineHeight) >= 1.8 ? '1.8em' : '1.1em',
  };
}

/** data-* attributes for the renderer/reader root. */
export function settingsToData(settings) {
  const s = resolveSettings(settings);
  return {
    'data-fra-theme': THEMES.some((t) => t.id === s.theme) ? s.theme : 'light',
    'data-fra-motion': s.noMotion ? 'none' : 'auto',
    'data-fra-focus': s.thickFocus ? 'thick' : 'normal',
  };
}
