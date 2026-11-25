import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrefs } from '../access/reader/readerPrefs.js';
import { startExtensionBridge } from './extensionBridge.js';

/**
 * App-wide side effects: the interface follows the reader's theme, the
 * reduce-motion override and thick focus rings; the extension bridge starts.
 */
export default function RootEffects() {
  const prefs = usePrefs();
  const navigate = useNavigate();
  const { theme, noMotion, thickFocus } = prefs.settings;

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.uiTheme = theme || 'light';
    if (noMotion || prefs.reduceMotion) el.dataset.reduceMotion = '';
    else delete el.dataset.reduceMotion;
    if (thickFocus) el.dataset.focus = 'thick';
    else delete el.dataset.focus;
  }, [theme, noMotion, thickFocus, prefs.reduceMotion]);

  useEffect(() => {
    startExtensionBridge(navigate);
  }, [navigate]);

  return null;
}
