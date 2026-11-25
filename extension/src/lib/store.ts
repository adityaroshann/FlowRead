// Thin wrappers over browser.storage. Shared settings live in storage.sync
// (keys `settings` and `profileId`, the same schema the web app uses);
// extension-only data lives in storage.local.
import { browser } from 'wxt/browser';
import { settingsForProfile, type ProfileId, type Settings } from '@flowread/core';
import { sanitizePrefs, sanitizeProfileId, sanitizeSettings, sanitizeSites, type ExtPrefs, type SiteList } from './schema';

export const KEYS = { settings: 'settings', profileId: 'profileId', prefs: 'prefs', sites: 'sites' } as const;

export interface SyncedState {
  settings: Settings;
  profileId: ProfileId | 'custom';
}

export async function getSynced(): Promise<SyncedState> {
  const got = await browser.storage.sync.get([KEYS.settings, KEYS.profileId]);
  return {
    settings: sanitizeSettings(got[KEYS.settings]),
    profileId: sanitizeProfileId(got[KEYS.profileId]) ?? 'standard',
  };
}

export async function setSettings(settings: Partial<Settings>, profileId?: ProfileId | 'custom') {
  const cur = await getSynced();
  const next = sanitizeSettings(settings, cur.settings);
  await browser.storage.sync.set({ [KEYS.settings]: next, [KEYS.profileId]: profileId ?? cur.profileId });
  return next;
}

export async function applyProfile(id: ProfileId) {
  const settings = settingsForProfile(id);
  await browser.storage.sync.set({ [KEYS.settings]: settings, [KEYS.profileId]: id });
  return settings;
}

export async function getPrefs(): Promise<ExtPrefs> {
  const got = await browser.storage.local.get(KEYS.prefs);
  return sanitizePrefs(got[KEYS.prefs]);
}

export async function setPrefs(patch: Partial<ExtPrefs>) {
  const next = sanitizePrefs({ ...(await getPrefs()), ...patch });
  await browser.storage.local.set({ [KEYS.prefs]: next });
  return next;
}

export async function getSites(): Promise<SiteList> {
  const got = await browser.storage.local.get(KEYS.sites);
  return sanitizeSites(got[KEYS.sites]);
}

export async function setSites(list: SiteList) {
  await browser.storage.local.set({ [KEYS.sites]: sanitizeSites(list) });
}

/** True when the settings no longer match the chosen profile's preset. */
export function isCustomised(settings: Settings, profileId: string): boolean {
  if (profileId === 'custom') return true;
  const preset = settingsForProfile(profileId);
  return (Object.keys(preset) as (keyof Settings)[]).some((k) => preset[k] !== settings[k]);
}
