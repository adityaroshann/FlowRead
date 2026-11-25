// React hook over the extension's stored settings, prefs and sites.
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ProfileId, Settings } from '@flowread/core';
import { applyProfile, getPrefs, getSites, getSynced, KEYS, setPrefs, setSettings, type SyncedState } from '../lib/store';
import { DEFAULT_PREFS, DEFAULT_SITES, type ExtPrefs, type SiteList } from '../lib/schema';

export function useExtensionState() {
  const [synced, setSynced] = useState<SyncedState | null>(null);
  const [prefs, setPrefsState] = useState<ExtPrefs>(DEFAULT_PREFS);
  const [sites, setSitesState] = useState<SiteList>(DEFAULT_SITES);

  const reload = useCallback(async () => {
    const [s, p, l] = await Promise.all([getSynced(), getPrefs(), getSites()]);
    setSynced(s);
    setPrefsState(p);
    setSitesState(l);
  }, []);

  useEffect(() => {
    void reload();
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if ((area === 'sync' && (KEYS.settings in changes || KEYS.profileId in changes)) || (area === 'local' && (KEYS.prefs in changes || KEYS.sites in changes))) {
        void reload();
      }
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, [reload]);

  return {
    synced,
    prefs,
    sites,
    /** Changing a single setting turns the profile into "custom" only in the label; the profile id is kept. */
    patchSettings: async (patch: Partial<Settings>) => {
      if (!synced) return;
      const next = { ...synced.settings, ...patch };
      setSynced({ ...synced, settings: next });
      await setSettings(next);
    },
    chooseProfile: async (id: ProfileId) => {
      const settings = await applyProfile(id);
      setSynced({ settings, profileId: id });
    },
    patchPrefs: async (patch: Partial<ExtPrefs>) => {
      setPrefsState({ ...prefs, ...patch });
      await setPrefs(patch);
    },
    setSitesLocal: setSitesState,
  };
}
