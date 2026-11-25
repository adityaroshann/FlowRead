import { useSyncExternalStore } from 'react';
import { THEME_COLORS, settingsToData } from '@flowread/core';
import type { PageActions, PageStore } from './state';
import { Toolbar } from './Toolbar';
import { FocusLine } from './FocusLine';
import { Toast } from './Toast';

export function App({ store, actions }: { store: PageStore; actions: PageActions }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const { settings } = state;
  // The UI follows the reading theme, so its colour pairs are the same
  // contrast-checked ones the page uses.
  const c = THEME_COLORS[settings.theme] ?? THEME_COLORS.light;
  const data = settingsToData(settings);
  const vars = { '--bg': c.bg, '--ink': c.text, '--muted': c.muted, '--accent': c.accent, '--mark': c.mark } as React.CSSProperties;

  return (
    <div className="fr-root" style={vars} data-motion={data['data-fra-motion']} data-focus={data['data-fra-focus']}>
      {state.on && state.prefs.toolbar && <Toolbar state={state} actions={actions} />}
      {state.on && settings.focusLine && <FocusLine />}
      {state.toast && <Toast message={state.toast} onClose={actions.dismissToast} />}
    </div>
  );
}
