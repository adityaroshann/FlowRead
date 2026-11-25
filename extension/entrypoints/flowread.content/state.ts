// Tiny observable store shared by the content script and its React UI.
import type { ProfileId, Settings } from '@flowread/core';
import type { ExtPrefs } from '../../src/lib/schema';

export interface PageState {
  on: boolean;
  settings: Settings;
  profileId: ProfileId | 'custom';
  prefs: ExtPrefs;
  toast: string | null;
}

export interface PageActions {
  setProfile(id: ProfileId): void;
  patchSettings(patch: Partial<Settings>): void;
  patchPrefs(patch: Partial<ExtPrefs>): void;
  turnOff(): void;
  simplify(text: string): Promise<{ ok: boolean; plain?: string; error?: string }>;
  dismissToast(): void;
}

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn());
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export type PageStore = ReturnType<typeof createStore<PageState>>;
