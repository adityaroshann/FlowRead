// Validation for settings that arrive from outside the extension (the web app
// bridge, storage written by an older version). The schema itself is
// DEFAULT_SETTINGS from @flowread/core; this only checks types and ranges.
import { DEFAULT_SETTINGS, FONTS, PROFILES, THEMES, type ProfileId, type Settings } from '@flowread/core';

const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  textScale: [0.8, 2],
  letterSpacing: [0, 0.35],
  wordSpacing: [0, 0.5],
  lineHeight: [1.2, 2.4],
  measure: [40, 100],
};

export function sanitizeSettings(input: unknown, base: Settings = { ...DEFAULT_SETTINGS }): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, ...base };
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!(key in src)) continue;
    const v = src[key];
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === 'boolean' && typeof v === 'boolean') (out as any)[key] = v;
    else if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      const r = RANGES[key];
      (out as any)[key] = r ? Math.min(r[1], Math.max(r[0], v)) : v;
    } else if (key === 'theme' && THEMES.some((t) => t.id === v)) out.theme = v as Settings['theme'];
    else if (key === 'font' && FONTS.some((f) => f.id === v)) out.font = v as Settings['font'];
  }
  return out;
}

export function sanitizeProfileId(v: unknown): ProfileId | 'custom' | null {
  if (v === 'custom') return 'custom';
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, v) ? (v as ProfileId) : null;
}

/** Extension-only preferences (not part of the shared settings schema). */
export interface ExtPrefs {
  /** Apply the theme's background and text colours to pages. */
  recolor: boolean;
  /** Show the on-page toolbar while FlowRead is on. */
  toolbar: boolean;
  /** Where the toolbar docks. */
  dock: 'br' | 'bl' | 'tr' | 'tl';
}
export const DEFAULT_PREFS: ExtPrefs = { recolor: true, toolbar: true, dock: 'br' };

export function sanitizePrefs(v: unknown): ExtPrefs {
  const p = { ...DEFAULT_PREFS };
  if (!v || typeof v !== 'object') return p;
  const s = v as Record<string, unknown>;
  if (typeof s.recolor === 'boolean') p.recolor = s.recolor;
  if (typeof s.toolbar === 'boolean') p.toolbar = s.toolbar;
  if (s.dock === 'br' || s.dock === 'bl' || s.dock === 'tr' || s.dock === 'tl') p.dock = s.dock;
  return p;
}

/** Sites where FlowRead switches on by itself. Origins like "https://example.org". */
export interface SiteList {
  sites: string[];
  all: boolean;
}
export const DEFAULT_SITES: SiteList = { sites: [], all: false };

export function sanitizeSites(v: unknown): SiteList {
  if (!v || typeof v !== 'object') return { ...DEFAULT_SITES };
  const s = v as Record<string, unknown>;
  const sites = Array.isArray(s.sites)
    ? [...new Set(s.sites.filter((x): x is string => typeof x === 'string' && /^https?:\/\/[^/]+$/.test(x)))]
    : [];
  return { sites, all: s.all === true };
}

/** "https://example.org" -> "https://example.org/*" */
export const originPattern = (origin: string) => `${origin}/*`;

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function isPdfUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /\.pdf$/i.test(u.pathname);
  } catch {
    return false;
  }
}
