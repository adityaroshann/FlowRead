import { useSyncExternalStore } from 'react';
import { PROFILES, resolveSettings, settingsForProfile } from '@flowread/core/profiles.js';

// Per-browser reading preferences (one shared store, so the reader, the
// landing-page demo and the extension bridge all see the same settings) and
// per-document reading progress.

export const PREFS_KEY = 'flowread-access:reader-prefs';
// Bump when profile presets change in a way old saved settings would hide.
export const PREFS_VERSION = 3;
const progressKey = (docId) => `flowread-access:progress:${docId}`;

/**
 * The web app reads in Atkinson Hyperlegible Next by default (it ships with the
 * app). Profiles whose preset says "system" get Atkinson here instead.
 */
export function webSettingsForProfile(id) {
  const s = settingsForProfile(id);
  if (s.font === 'system') s.font = 'atkinson';
  return s;
}

function read() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const profileId = PROFILES[p?.profileId] ? p.profileId : 'standard';
      // Settings saved by an older version are reset to the profile's current preset.
      const fresh = p?.version === PREFS_VERSION && p?.settings;
      return {
        profileId,
        settings: fresh ? resolveSettings(p.settings) : webSettingsForProfile(profileId),
        chosen: true,
        // App-level option: reduce motion in the interface (separate from the reading profile)
        reduceMotion: !!p?.reduceMotion,
      };
    }
  } catch {
    /* ignore */
  }
  return { profileId: 'standard', settings: webSettingsForProfile('standard'), chosen: false, reduceMotion: false };
}

let state = null;
const listeners = new Set();

function current() {
  if (!state) state = read();
  return state;
}

function write(next) {
  state = next;
  if (next.chosen) {
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ version: PREFS_VERSION, profileId: next.profileId, settings: next.settings, reduceMotion: next.reduceMotion }),
      );
    } catch {
      /* storage unavailable: preferences last for this visit only */
    }
  }
  listeners.forEach((l) => l());
}

export function getPrefs() {
  return current();
}

/** setPrefs(patch | (prev) => next). `source` lets the extension bridge avoid echo loops. */
export function setPrefs(update, { source = 'app' } = {}) {
  const prev = current();
  const next = typeof update === 'function' ? update(prev) : { ...prev, ...update };
  write({ ...next, lastSource: source });
}

export function subscribePrefs(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePrefs() {
  return useSyncExternalStore(subscribePrefs, current, current);
}

export function chooseProfile(id) {
  setPrefs((p) => ({ ...p, profileId: id, settings: webSettingsForProfile(id), chosen: true }));
}

export function updateSettings(patch) {
  setPrefs((p) => ({ ...p, settings: { ...p.settings, ...patch }, chosen: true }));
}

// Keep tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PREFS_KEY) {
      state = read();
      listeners.forEach((l) => l());
    }
  });
}

// ---------- progress ----------

/** { section, pct (0-100), updatedAt } or null */
export function loadProgress(docId) {
  try {
    const raw = window.localStorage.getItem(progressKey(docId));
    const p = raw ? JSON.parse(raw) : null;
    if (!p || !Number.isInteger(p.section)) return null;
    return { section: p.section, pct: Number.isFinite(p.pct) ? p.pct : 0, updatedAt: p.updatedAt || null };
  } catch {
    return null;
  }
}

export function saveProgress(docId, section, pct) {
  try {
    const prev = loadProgress(docId);
    window.localStorage.setItem(
      progressKey(docId),
      JSON.stringify({
        section,
        pct: Math.max(prev?.pct || 0, Math.round(pct || 0)),
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function clearProgress(docId) {
  try {
    window.localStorage.removeItem(progressKey(docId));
  } catch {
    /* ignore */
  }
}
