import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'flowread-settings';

const DEFAULTS = {
  intensity: 0.45,
  fontSize: 'md',
  lineHeight: 'relaxed',
  theme: 'cream',
  fontFamily: 'default',
};

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULTS, ...parsed };
    }
  } catch { /* silent */ }
  // Also try to read legacy theme key
  try {
    const legacyTheme = localStorage.getItem('flowread-theme');
    if (legacyTheme) return { ...DEFAULTS, theme: legacyTheme };
  } catch { /* silent */ }
  return DEFAULTS;
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      // Also keep legacy theme key for backwards compat
      localStorage.setItem('flowread-theme', settings.theme);
    } catch { /* silent */ }
  }, [settings]);

  // Apply theme and font to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-font', settings.fontFamily);
  }, [settings.theme, settings.fontFamily]);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'cream' : 'dark',
    }));
  }, []);

  return { settings, updateSettings, toggleTheme };
}
