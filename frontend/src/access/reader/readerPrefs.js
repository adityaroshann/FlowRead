import { resolveSettings, settingsForProfile, PROFILES } from '../shared/profiles.js';

// Per-browser reading preferences and per-document progress.
export const PREFS_KEY = 'flowread-access:reader-prefs';
const progressKey = (docId) => `flowread-access:progress:${docId}`;

export function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const profileId = PROFILES[p?.profileId] ? p.profileId : 'standard';
      return { profileId, settings: resolveSettings(p?.settings || profileId), chosen: true };
    }
  } catch {
    /* ignore */
  }
  return { profileId: 'standard', settings: settingsForProfile('standard'), chosen: false };
}

export function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ profileId: prefs.profileId, settings: prefs.settings }));
  } catch {
    /* storage unavailable: preferences last for this visit only */
  }
}

export function loadProgress(docId) {
  try {
    const raw = window.localStorage.getItem(progressKey(docId));
    const p = raw ? JSON.parse(raw) : null;
    return Number.isInteger(p?.section) ? p.section : null;
  } catch {
    return null;
  }
}

export function saveProgress(docId, section) {
  try {
    window.localStorage.setItem(progressKey(docId), JSON.stringify({ section, updatedAt: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}
