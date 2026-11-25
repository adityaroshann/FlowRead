// Types for the framework-free JS shared package (packages/core/src).
declare module '@flowread/core' {
  export interface Settings {
    theme: 'light' | 'cream' | 'dark' | 'high-contrast';
    font: 'system' | 'atkinson' | 'lexend' | 'dyslexic' | 'serif';
    textScale: number;
    letterSpacing: number;
    wordSpacing: number;
    lineHeight: number;
    measure: number;
    boldStarts: boolean;
    boldIntensity: number;
    readAloud: boolean;
    plainLanguage: boolean;
    focusMode: boolean;
    summaries: boolean;
    focusLine: boolean;
    focusLineSize: number;
    focusDim: boolean;
    readingTimer: boolean;
    noMotion: boolean;
    minimalChrome: boolean;
    thickFocus: boolean;
    imageDetails: boolean;
    mathSpoken: boolean;
    announceSections: boolean;
  }
  export type ProfileId = 'standard' | 'dyslexia' | 'focus' | 'screenreader' | 'lowvision';
  export interface Profile { id: ProfileId; label: string; description: string; settings: Settings }
  export const THEMES: { id: Settings['theme']; label: string }[];
  export const FONTS: { id: Settings['font']; label: string }[];
  export const DEFAULT_SETTINGS: Readonly<Settings>;
  export const PROFILES: Record<ProfileId, Profile>;
  export const PROFILE_ORDER: ProfileId[];
  export function getProfile(id: string): Profile;
  export function settingsForProfile(id: string): Settings;
  export function resolveSettings(p?: unknown): Settings;
  export function settingsToStyle(s: Partial<Settings>): Record<string, string>;
  export function settingsToData(s: Partial<Settings>): Record<string, string>;
  export function boldLength(n: number): number;
  export function splitWordStart(word: string): [string, string, string];
  export function boldRanges(text: string): { start: number; end: number }[];
  export function boldSegments(text: string, ratio?: number): { text: string; bold: boolean }[];
  export const THEME_COLORS: Readonly<Record<Settings['theme'], { bg: string; text: string; muted: string; accent: string; mark: string }>>;
  export const FONT_FAMILIES: Readonly<Record<Settings['font'], string>>;
  export function readingCss(s: Partial<Settings>, o?: { scope?: string; recolor?: boolean; boldClass?: string }): string;
}
